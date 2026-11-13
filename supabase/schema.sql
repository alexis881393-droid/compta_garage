-- Compta Garage : schéma complet de la base.
-- À exécuter dans Supabase > SQL Editor. Le script est relançable : il peut être
-- rejoué en entier après chaque mise à jour du site.

-- ===========================================================================
-- 1. Comptes et grades
-- ===========================================================================

-- Un grade regroupe des permissions (clés de fonctions). '*' donne accès à tout.
create table if not exists public.grades (
  id          bigint generated always as identity primary key,
  nom         text not null unique,
  permissions text[] not null default '{}'
);

-- Rang hiérarchique : 1 = le plus bas, plus le nombre est grand plus le grade est élevé.
alter table public.grades add column if not exists niveau int not null default 0;

-- Un profil par compte Supabase Auth. Sans grade, l'utilisateur n'a accès à rien.
create table if not exists public.profils (
  id         uuid primary key references auth.users (id) on delete cascade,
  nom        text,
  grade_id   bigint references public.grades (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Score social, saisi à la main par la direction. Il fixe la fourchette de
-- salaire et le pourcentage de prime (voir bareme_score).
alter table public.profils
  add column if not exists score_social int not null default 0 check (score_social >= 0);

-- Vrai si le grade de l'utilisateur connecté contient la permission demandée.
-- À réutiliser dans les règles RLS de toutes les tables.
create or replace function public.a_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profils p
    join public.grades g on g.id = p.grade_id
    where p.id = (select auth.uid())
      and ('*' = any (g.permissions) or perm = any (g.permissions))
  );
$$;

-- Crée automatiquement le profil (sans grade) à l'inscription.
create or replace function public.creer_profil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profils (id, nom)
  values (new.id, new.raw_user_meta_data ->> 'nom');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.creer_profil();

-- Grades du garage, du plus bas au plus haut.
-- Permissions existantes :
--   ventes.creer       valider un ticket de caisse
--   ventes.lire_tout   voir les ventes de tous les employés (sinon : les siennes)
--   partenaires.gerer  ajouter, renommer, désactiver des partenaires
--   reglages.modifier  changer les prix, la commission, la remise, le % de salaire
--   compta.globale     compta globale, charges, résultats par employé, archives,
--                      factures partenaires
--   equipe.gerer       attribuer score social et grade aux grades inférieurs
--   semaine.cloturer   clôturer la semaine (remise à zéro + archive)
--   admin.utilisateurs gérer tous les comptes sans restriction de grade
-- Attention : relancer ce script remet les permissions des grades à ces valeurs.
insert into public.grades (nom, niveau, permissions)
values
  ('Stagiaire',        1, '{ventes.creer}'),
  ('Employé confirmé', 2, '{ventes.creer}'),
  ('Chef d''équipe',   3, '{ventes.creer}'),
  ('Manager',          4, '{ventes.creer,ventes.lire_tout,partenaires.gerer}'),
  ('Co-patron',        5, '{ventes.creer,ventes.lire_tout,partenaires.gerer,reglages.modifier,compta.globale,equipe.gerer}'),
  ('Patron',           6, '{*}')
on conflict (nom) do update
  set niveau = excluded.niveau, permissions = excluded.permissions;

-- Après avoir créé votre propre compte sur le site, donnez-vous le grade Patron :
--   update public.profils
--   set grade_id = (select id from public.grades where nom = 'Patron')
--   where id = (select id from auth.users where email = 'votre@email.fr');

-- ===========================================================================
-- 2. Tables de la caisse et de la comptabilité
-- ===========================================================================

-- Réparations à prix fixe : 100 % du prix est du bénéfice pour le garage.
create table if not exists public.tarifs (
  cle     text primary key,
  libelle text not null,
  prix    bigint not null check (prix >= 0),
  ordre   int not null default 0
);

insert into public.tarifs (cle, libelle, prix, ordre)
values
  ('pneu',        'Pneu',                   100, 1),
  ('carrosserie', 'Réparation carrosserie', 200, 2),
  ('moteur',      'Réparation moteur',      300, 3)
on conflict (cle) do nothing;

-- Réglages numériques du garage.
--   commission_custom_pct  bénéfice du garage sur un custom, en % du prix d'usine
--   remise_partenaire_pct  réduction appliquée aux tickets d'un partenaire
--   salaire_pct_ventes     part du bénéfice rapporté par l'employé qui s'ajoute
--                          au minimum de sa fourchette de salaire
create table if not exists public.reglages (
  cle    text primary key,
  valeur numeric not null check (valeur >= 0)
);

insert into public.reglages (cle, valeur)
values
  ('commission_custom_pct', 100),
  ('remise_partenaire_pct', 20),
  ('salaire_pct_ventes', 10)
on conflict (cle) do nothing;

-- Semaines comptables. Une seule est ouverte à la fois (fin nulle). La clôture
-- fige les résultats dans "resume" et ouvre la semaine suivante.
create table if not exists public.semaines (
  id           bigint generated always as identity primary key,
  debut        timestamptz not null default now(),
  fin          timestamptz,
  cloturee_par uuid references public.profils (id) on delete set null,
  resume       jsonb
);

create unique index if not exists semaines_une_ouverte on public.semaines ((true)) where fin is null;

insert into public.semaines (debut)
select now() where not exists (select 1 from public.semaines where fin is null);

create or replace function public.semaine_ouverte()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.semaines where fin is null;
$$;

-- Entreprises partenaires : leurs tickets ont une remise et partent sur facture.
create table if not exists public.partenaires (
  id         bigint generated always as identity primary key,
  nom        text not null unique check (length(trim(nom)) > 0),
  actif      boolean not null default true,
  created_at timestamptz not null default now()
);

-- Journal des ventes, une ligne par ligne de ticket. "benefice" est ce que le
-- garage gagne réellement, remise déduite : le prix complet pour une réparation,
-- uniquement la commission pour un custom (le prix d'usine n'est pas un gain).
create table if not exists public.ventes (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  employe_id uuid references public.profils (id) on delete set null,
  type       text not null check (type in ('reparation', 'custom')),
  libelle    text not null,
  quantite   int not null default 1 check (quantite > 0),
  prix_usine bigint not null default 0 check (prix_usine >= 0),
  benefice   bigint not null check (benefice >= 0)
);

create sequence if not exists public.ticket_seq;

alter table public.ventes
  add column if not exists semaine_id    bigint references public.semaines (id),
  add column if not exists ticket_id     bigint,
  add column if not exists partenaire_id bigint references public.partenaires (id),
  add column if not exists remise_pct    numeric not null default 0,
  -- Ligne partenaire : date à laquelle elle a été facturée au partenaire.
  add column if not exists facture_le    timestamptz;

update public.ventes set semaine_id = public.semaine_ouverte() where semaine_id is null;

create index if not exists ventes_created_at_idx on public.ventes (created_at desc);
create index if not exists ventes_semaine_idx on public.ventes (semaine_id);

-- Charges saisies à la main pour la semaine (loyer, pièces, etc.).
-- Les salaires s'y ajoutent automatiquement dans le calcul.
create table if not exists public.charges (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  semaine_id bigint not null default public.semaine_ouverte() references public.semaines (id),
  libelle    text not null check (length(trim(libelle)) > 0),
  montant    bigint not null check (montant > 0),
  cree_par   uuid default auth.uid() references public.profils (id) on delete set null
);

-- ===========================================================================
-- 3. Droits d'accès (RLS)
-- ===========================================================================

alter table public.grades      enable row level security;
alter table public.profils     enable row level security;
alter table public.tarifs      enable row level security;
alter table public.reglages    enable row level security;
alter table public.semaines    enable row level security;
alter table public.partenaires enable row level security;
alter table public.ventes      enable row level security;
alter table public.charges     enable row level security;

drop policy if exists "grades_lecture" on public.grades;
drop policy if exists "grades_admin" on public.grades;
drop policy if exists "profils_lecture" on public.profils;
drop policy if exists "profils_admin" on public.profils;
drop policy if exists "tarifs_lecture" on public.tarifs;
drop policy if exists "tarifs_modif" on public.tarifs;
drop policy if exists "reglages_lecture" on public.reglages;
drop policy if exists "reglages_modif" on public.reglages;
drop policy if exists "semaines_lecture" on public.semaines;
drop policy if exists "partenaires_lecture" on public.partenaires;
drop policy if exists "partenaires_ajout" on public.partenaires;
drop policy if exists "partenaires_modif" on public.partenaires;
drop policy if exists "ventes_lecture" on public.ventes;
drop policy if exists "charges_lecture" on public.charges;
drop policy if exists "charges_ajout" on public.charges;
drop policy if exists "charges_suppression" on public.charges;

create policy "grades_lecture" on public.grades
  for select to authenticated using (true);
create policy "grades_admin" on public.grades
  for all to authenticated
  using (public.a_permission('admin.utilisateurs'))
  with check (public.a_permission('admin.utilisateurs'));

-- Profils : lisibles par tout utilisateur connecté (nom affiché dans les ventes).
-- Score et grade ne se modifient que par la fonction maj_employe.
create policy "profils_lecture" on public.profils
  for select to authenticated using (true);

create policy "tarifs_lecture" on public.tarifs
  for select to authenticated using (true);
create policy "tarifs_modif" on public.tarifs
  for update to authenticated
  using (public.a_permission('reglages.modifier'))
  with check (public.a_permission('reglages.modifier'));

create policy "reglages_lecture" on public.reglages
  for select to authenticated using (true);
create policy "reglages_modif" on public.reglages
  for update to authenticated
  using (public.a_permission('reglages.modifier'))
  with check (public.a_permission('reglages.modifier'));

-- Semaines (dont les archives) : direction uniquement.
create policy "semaines_lecture" on public.semaines
  for select to authenticated using (public.a_permission('compta.globale'));

create policy "partenaires_lecture" on public.partenaires
  for select to authenticated using (true);
create policy "partenaires_ajout" on public.partenaires
  for insert to authenticated with check (public.a_permission('partenaires.gerer'));
create policy "partenaires_modif" on public.partenaires
  for update to authenticated
  using (public.a_permission('partenaires.gerer'))
  with check (public.a_permission('partenaires.gerer'));

-- Ventes : chacun voit les siennes, 'ventes.lire_tout' voit tout.
-- Aucune règle d'écriture : les ventes n'entrent que par enregistrer_ticket,
-- qui calcule les montants côté serveur (un employé ne peut pas envoyer un
-- montant falsifié).
create policy "ventes_lecture" on public.ventes
  for select to authenticated
  using (employe_id = (select auth.uid()) or public.a_permission('ventes.lire_tout'));

-- Charges : direction uniquement, et seulement sur la semaine ouverte.
create policy "charges_lecture" on public.charges
  for select to authenticated using (public.a_permission('compta.globale'));
create policy "charges_ajout" on public.charges
  for insert to authenticated
  with check (public.a_permission('compta.globale') and semaine_id = public.semaine_ouverte());
create policy "charges_suppression" on public.charges
  for delete to authenticated
  using (public.a_permission('compta.globale') and semaine_id = public.semaine_ouverte());

-- ===========================================================================
-- 4. Barèmes
-- ===========================================================================

-- Barème du score social : pourcentage de prime et fourchette de salaire.
create or replace function public.bareme_score(p_score int)
returns table (prime_pct numeric, salaire_min bigint, salaire_max bigint)
language sql
immutable
set search_path = ''
as $$
  select b.prime_pct::numeric, b.salaire_min::bigint, b.salaire_max::bigint
  from (values
    (    0,  5.0,  6000, 12000),  -- moins de 5 000
    ( 5000,  7.5, 12000, 15000),  -- 5 000 à 8 000
    ( 8001, 10.0, 15000, 18000),  -- 8 001 à 12 000
    (12001, 15.0, 18000, 22500),  -- 12 001 à 18 000
    (18001, 20.0, 22500, 25000),  -- 18 001 à 20 000
    (20001, 30.0, 25000, 30000),  -- 20 001 à 25 000
    (25001, 35.0, 30000, 40000)   -- plus de 25 000
  ) as b (seuil, prime_pct, salaire_min, salaire_max)
  where b.seuil <= greatest(coalesce(p_score, 0), 0)
  order by b.seuil desc
  limit 1;
$$;

-- Salaire de la semaine : minimum de la fourchette + un pourcentage du bénéfice
-- rapporté par l'employé, plafonné au maximum de la fourchette.
create or replace function public.salaire_calcule(p_score int, p_benefice numeric)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select least(
    b.salaire_max,
    b.salaire_min + round(
      greatest(coalesce(p_benefice, 0), 0)
      * coalesce((select valeur from public.reglages where cle = 'salaire_pct_ventes'), 10) / 100
    )
  )::bigint
  from public.bareme_score(p_score) b;
$$;

-- Impôt progressif par tranches sur le bénéfice imposable.
create or replace function public.impot(p_base numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_base, 0) <= 0 then 0 else round(
      least(p_base, 15000) * 0.05
    + greatest(least(p_base, 50000)  - 15000,  0) * 0.10
    + greatest(least(p_base, 100000) - 50000,  0) * 0.20
    + greatest(least(p_base, 300000) - 100000, 0) * 0.30
    + greatest(least(p_base, 500000) - 300000, 0) * 0.40
    + greatest(p_base - 500000, 0) * 0.50
  ) end;
$$;

-- ===========================================================================
-- 5. Fonctions métier
-- ===========================================================================

drop function if exists public.enregistrer_reparations(jsonb);
drop function if exists public.enregistrer_custom(bigint);

-- Valide un ticket de caisse. p_lignes est un tableau :
--   [{"type": "reparation", "cle": "pneu", "quantite": 4},
--    {"type": "custom", "prix_usine": 10000}]
-- Avec un partenaire, la remise s'applique au bénéfice du garage et le ticket
-- part sur la facture du partenaire. Renvoie le numéro de ticket.
create or replace function public.enregistrer_ticket(p_lignes jsonb, p_partenaire bigint default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  l jsonb;
  t public.tarifs;
  q int;
  pu bigint;
  remise numeric := 0;
  commission numeric;
  tid bigint;
  sid bigint;
begin
  if not public.a_permission('ventes.creer') then
    raise exception 'Accès refusé';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Ticket vide';
  end if;
  if jsonb_array_length(p_lignes) > 50 then
    raise exception 'Ticket trop long';
  end if;
  if p_partenaire is not null then
    perform 1 from public.partenaires where id = p_partenaire and actif;
    if not found then
      raise exception 'Partenaire inconnu ou désactivé';
    end if;
    select least(valeur, 100) into remise from public.reglages where cle = 'remise_partenaire_pct';
    remise := coalesce(remise, 20);
  end if;
  select valeur into commission from public.reglages where cle = 'commission_custom_pct';
  commission := coalesce(commission, 100);
  sid := public.semaine_ouverte();
  tid := nextval('public.ticket_seq');

  for l in select value from jsonb_array_elements(p_lignes) loop
    if l ->> 'type' = 'reparation' then
      q := coalesce((l ->> 'quantite')::int, 1);
      if q < 1 or q > 100 then
        raise exception 'Quantité invalide';
      end if;
      select * into t from public.tarifs where cle = l ->> 'cle';
      if not found then
        raise exception 'Réparation inconnue : %', l ->> 'cle';
      end if;
      insert into public.ventes
        (employe_id, semaine_id, ticket_id, partenaire_id, type, libelle, quantite, benefice, remise_pct)
      values
        (auth.uid(), sid, tid, p_partenaire, 'reparation', t.libelle, q,
         round(t.prix * q * (100 - remise) / 100), remise);
    elsif l ->> 'type' = 'custom' then
      pu := (l ->> 'prix_usine')::bigint;
      if pu is null or pu <= 0 then
        raise exception 'Prix d''usine invalide';
      end if;
      insert into public.ventes
        (employe_id, semaine_id, ticket_id, partenaire_id, type, libelle, prix_usine, benefice, remise_pct)
      values
        (auth.uid(), sid, tid, p_partenaire, 'custom', 'Custom', pu,
         round(pu * commission / 100 * (100 - remise) / 100), remise);
    else
      raise exception 'Ligne de ticket invalide';
    end if;
  end loop;
  return tid;
end;
$$;

-- Salaire en cours de l'employé connecté, sur la semaine ouverte.
create or replace function public.mon_salaire()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'score', p.score_social,
    'nb_ventes', v.nb,
    'benefice', v.benefice,
    'salaire_min', b.salaire_min,
    'salaire_max', b.salaire_max,
    'salaire', public.salaire_calcule(p.score_social, v.benefice),
    'salaire_pct', coalesce((select valeur from public.reglages where cle = 'salaire_pct_ventes'), 10),
    'prime_pct', b.prime_pct
  )
  from public.profils p
  cross join lateral public.bareme_score(p.score_social) b
  cross join lateral (
    select count(*) as nb, coalesce(sum(benefice), 0) as benefice
    from public.ventes
    where employe_id = p.id and semaine_id = public.semaine_ouverte()
  ) v
  where p.id = auth.uid();
$$;

-- Calcul complet d'une semaine. Fonction interne : appelée par resume_semaine
-- et cloturer_semaine, jamais directement par le site.
--   bénéfice − (charges saisies + salaires) = bénéfice imposable
--   bénéfice imposable − impôt = reste
--   prime d'un employé = reste × (sa part du bénéfice) × son % de prime
create or replace function public.calcul_semaine(p_semaine bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.semaines;
  v_emp jsonb;
  v_charges jsonb;
  v_benef numeric;
  v_repa numeric;
  v_custom numeric;
  v_usine numeric;
  v_charges_saisies numeric;
  v_salaires numeric;
  v_imposable numeric;
  v_impot numeric;
  v_reste numeric;
  v_primes numeric;
begin
  select * into s from public.semaines where id = p_semaine;

  select coalesce(sum(benefice), 0),
         coalesce(sum(benefice) filter (where type = 'reparation'), 0),
         coalesce(sum(benefice) filter (where type = 'custom'), 0),
         coalesce(sum(prix_usine), 0)
    into v_benef, v_repa, v_custom, v_usine
  from public.ventes where semaine_id = p_semaine;

  select coalesce(sum(montant), 0),
         coalesce(jsonb_agg(jsonb_build_object('id', id, 'libelle', libelle, 'montant', montant) order by id), '[]'::jsonb)
    into v_charges_saisies, v_charges
  from public.charges where semaine_id = p_semaine;

  -- Tout employé ayant un grade touche au moins le minimum de sa fourchette.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'nom', e.nom, 'grade', e.grade, 'score', e.score,
           'nb_ventes', e.nb, 'benefice', e.benefice,
           'salaire_min', b.salaire_min, 'salaire_max', b.salaire_max,
           'salaire', public.salaire_calcule(e.score, e.benefice),
           'prime_pct', b.prime_pct)), '[]'::jsonb)
    into v_emp
  from (
    select p.id, p.nom, g.nom as grade, p.score_social as score,
           coalesce(v.nb, 0) as nb, coalesce(v.benefice, 0) as benefice
    from public.profils p
    left join public.grades g on g.id = p.grade_id
    left join (
      select employe_id, count(*) as nb, sum(benefice) as benefice
      from public.ventes where semaine_id = p_semaine group by employe_id
    ) v on v.employe_id = p.id
    where p.grade_id is not null or v.nb > 0
  ) e
  cross join lateral public.bareme_score(e.score) b;

  select coalesce(sum((x ->> 'salaire')::numeric), 0) into v_salaires
  from jsonb_array_elements(v_emp) x;

  v_imposable := v_benef - v_charges_saisies - v_salaires;
  v_impot := public.impot(v_imposable);
  v_reste := v_imposable - v_impot;

  select coalesce(jsonb_agg(x || jsonb_build_object('prime',
           case when v_reste > 0 and v_benef > 0
                then round(v_reste * (x ->> 'benefice')::numeric / v_benef * (x ->> 'prime_pct')::numeric / 100)
                else 0 end)
           order by (x ->> 'benefice')::numeric desc, x ->> 'nom'), '[]'::jsonb)
    into v_emp
  from jsonb_array_elements(v_emp) x;

  select coalesce(sum((x ->> 'prime')::numeric), 0) into v_primes
  from jsonb_array_elements(v_emp) x;

  return jsonb_build_object(
    'semaine_id', p_semaine, 'debut', s.debut, 'fin', s.fin,
    'benefice', v_benef, 'benefice_reparations', v_repa, 'benefice_customs', v_custom,
    'prix_usine', v_usine,
    'charges_saisies', v_charges_saisies, 'salaires', v_salaires,
    'imposable', v_imposable, 'impot', v_impot, 'reste', v_reste,
    'primes', v_primes, 'solde', v_reste - v_primes,
    'employes', v_emp, 'charges', v_charges
  );
end;
$$;

-- Compta globale de la semaine ouverte (direction).
create or replace function public.resume_semaine()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.a_permission('compta.globale') then
    raise exception 'Accès refusé';
  end if;
  return public.calcul_semaine(public.semaine_ouverte());
end;
$$;

-- Clôture la semaine : fige les résultats dans l'archive et ouvre une nouvelle
-- semaine à zéro. Les ventes restent en base, rattachées à la semaine archivée.
create or replace function public.cloturer_semaine()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid bigint;
begin
  if not public.a_permission('semaine.cloturer') then
    raise exception 'Accès refusé';
  end if;
  sid := public.semaine_ouverte();
  update public.semaines
  set fin = now(),
      cloturee_par = auth.uid(),
      resume = public.calcul_semaine(sid) || jsonb_build_object('fin', now())
  where id = sid;
  insert into public.semaines default values;
end;
$$;

-- Marque comme facturées toutes les lignes en attente d'un partenaire.
create or replace function public.marquer_facture(p_partenaire bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.a_permission('compta.globale') then
    raise exception 'Accès refusé';
  end if;
  update public.ventes set facture_le = now()
  where partenaire_id = p_partenaire and facture_le is null;
end;
$$;

-- Attribue score social et grade à un employé. Sans 'admin.utilisateurs', on ne
-- gère que les grades strictement inférieurs au sien. Personne ne change son
-- propre grade (évite qu'un patron se retire l'accès par erreur).
create or replace function public.maj_employe(p_id uuid, p_score int, p_grade bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mon_niveau int;
  cible_niveau int;
  cible_grade bigint;
  nouveau_niveau int;
begin
  if not public.a_permission('equipe.gerer') then
    raise exception 'Accès refusé';
  end if;
  if p_score is null or p_score < 0 then
    raise exception 'Score social invalide';
  end if;
  select p.grade_id, coalesce(g.niveau, 0) into cible_grade, cible_niveau
  from public.profils p left join public.grades g on g.id = p.grade_id
  where p.id = p_id;
  if not found then
    raise exception 'Employé introuvable';
  end if;
  if p_id = auth.uid() and cible_grade is distinct from p_grade then
    raise exception 'Vous ne pouvez pas changer votre propre grade';
  end if;
  if not public.a_permission('admin.utilisateurs') then
    select g.niveau into mon_niveau
    from public.profils p join public.grades g on g.id = p.grade_id
    where p.id = auth.uid();
    select niveau into nouveau_niveau from public.grades where id = p_grade;
    if cible_niveau >= mon_niveau or coalesce(nouveau_niveau, 0) >= mon_niveau then
      raise exception 'Vous ne pouvez gérer que les grades inférieurs au vôtre';
    end if;
  end if;
  update public.profils set score_social = p_score, grade_id = p_grade where id = p_id;
end;
$$;

-- Totaux par type sur les ventes de la semaine ouverte visibles par l'utilisateur.
create or replace function public.totaux_ventes()
returns table (type text, nombre bigint, prix_usine numeric, benefice numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.type, count(*), coalesce(sum(v.prix_usine), 0), coalesce(sum(v.benefice), 0)
  from public.ventes v
  where v.semaine_id = public.semaine_ouverte()
  group by v.type;
$$;

-- Les fonctions ne sont appelables que par un utilisateur connecté ;
-- calcul_semaine reste interne.
revoke execute on function public.enregistrer_ticket(jsonb, bigint) from public, anon;
revoke execute on function public.mon_salaire() from public, anon;
revoke execute on function public.calcul_semaine(bigint) from public, anon, authenticated;
revoke execute on function public.resume_semaine() from public, anon;
revoke execute on function public.cloturer_semaine() from public, anon;
revoke execute on function public.marquer_facture(bigint) from public, anon;
revoke execute on function public.maj_employe(uuid, int, bigint) from public, anon;
revoke execute on function public.totaux_ventes() from public, anon;
grant execute on function public.enregistrer_ticket(jsonb, bigint) to authenticated;
grant execute on function public.mon_salaire() to authenticated;
grant execute on function public.resume_semaine() to authenticated;
grant execute on function public.cloturer_semaine() to authenticated;
grant execute on function public.marquer_facture(bigint) to authenticated;
grant execute on function public.maj_employe(uuid, int, bigint) to authenticated;
grant execute on function public.totaux_ventes() to authenticated;
