--
-- PostgreSQL database dump
--

\restrict V7n9VjYKlcXOeZu6FNl8XVrktXFOqOfPTkxdRUFhEHMlResZMejXV1fppACZUXw

-- Dumped from database version 18.4 (eaf151e)
-- Dumped by pg_dump version 18.0

-- Started on 2026-07-01 23:59:59

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 5 (class 2615 OID 559573)
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- TOC entry 4040 (class 0 OID 0)
-- Dependencies: 5
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- TOC entry 325 (class 1255 OID 559575)
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- TOC entry 326 (class 1255 OID 559576)
-- Name: update_encounter_nodes_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_encounter_nodes_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 219 (class 1259 OID 559577)
-- Name: bt2_job_instance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bt2_job_instance (
    id character varying(100) NOT NULL,
    job_cancelled boolean NOT NULL,
    cmb_recs_processed integer,
    cmb_recs_per_sec double precision,
    create_time timestamp(6) without time zone NOT NULL,
    cur_gated_step_id character varying(100),
    definition_id character varying(100) NOT NULL,
    definition_ver integer NOT NULL,
    end_time timestamp(6) without time zone,
    error_count integer NOT NULL,
    error_msg character varying(500),
    est_remaining character varying(100),
    fast_tracking boolean,
    params_json character varying(2000),
    params_json_lob oid,
    params_json_vc text,
    progress_pct double precision NOT NULL,
    report oid,
    report_vc text,
    start_time timestamp(6) without time zone,
    stat character varying(20) NOT NULL,
    tot_elapsed_millis integer,
    client_id character varying(200),
    user_name character varying(200),
    update_time timestamp(6) without time zone,
    user_data_json text,
    warning_msg character varying(4000),
    work_chunks_purged boolean NOT NULL
);


--
-- TOC entry 220 (class 1259 OID 559591)
-- Name: bt2_work_chunk; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bt2_work_chunk (
    id character varying(100) NOT NULL,
    create_time timestamp(6) without time zone NOT NULL,
    end_time timestamp(6) without time zone,
    error_count integer NOT NULL,
    error_msg character varying(500),
    instance_id character varying(100) NOT NULL,
    definition_id character varying(100) NOT NULL,
    definition_ver integer NOT NULL,
    next_poll_time timestamp(6) without time zone,
    poll_attempts integer,
    records_processed integer,
    seq integer NOT NULL,
    chunk_data oid,
    chunk_data_vc text,
    start_time timestamp(6) without time zone,
    stat character varying(20) NOT NULL,
    tgt_step_id character varying(100) NOT NULL,
    update_time timestamp(6) without time zone,
    warning_msg character varying(4000)
);


--
-- TOC entry 221 (class 1259 OID 559605)
-- Name: encounter_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encounter_nodes (
    encounter_fhir_id character varying(64) NOT NULL,
    res_type character varying(40) DEFAULT 'Encounter'::character varying NOT NULL,
    patient_id character varying(64) NOT NULL,
    title character varying(255),
    category character varying(50),
    priority character varying(20),
    normality character varying(20),
    event_date timestamp without time zone,
    details text,
    is_diagnosis boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    deleted_at timestamp without time zone,
    is_deleted boolean DEFAULT false NOT NULL,
    related_resource_ids jsonb,
    is_manual_branch boolean DEFAULT false,
    branch_state character varying(20) DEFAULT 'in_progress'::character varying,
    branch_id character varying(64) DEFAULT NULL::character varying,
    practitioner_id character varying(255),
    CONSTRAINT check_is_encounter CHECK (((res_type)::text = 'Encounter'::text)),
    CONSTRAINT check_valid_branch_state CHECK (((branch_state)::text = ANY (ARRAY[('in_progress'::character varying)::text, ('completed'::character varying)::text, ('discontinued'::character varying)::text, ('finish_case'::character varying)::text]))),
    CONSTRAINT chk_normality CHECK (((normality)::text = ANY (ARRAY[('Pending'::character varying)::text, ('Normal'::character varying)::text, ('Abnormal'::character varying)::text, ('Unknown'::character varying)::text]))),
    CONSTRAINT chk_priority CHECK (((priority)::text = ANY (ARRAY[('Low'::character varying)::text, ('Medium'::character varying)::text, ('High'::character varying)::text])))
);


--
-- TOC entry 4041 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN encounter_nodes.is_manual_branch; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.encounter_nodes.is_manual_branch IS 'Indicates if this node was manually created as a new branch (not from FHIR import)';


--
-- TOC entry 222 (class 1259 OID 559626)
-- Name: hfj_binary_storage_blob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_binary_storage_blob (
    blob_id character varying(200) NOT NULL,
    blob_data oid,
    content_type character varying(100) NOT NULL,
    blob_hash character varying(128),
    published_date timestamp(6) without time zone NOT NULL,
    resource_id character varying(100) NOT NULL,
    blob_size bigint NOT NULL,
    storage_content_bin bytea
);


--
-- TOC entry 223 (class 1259 OID 559636)
-- Name: hfj_blk_export_colfile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_blk_export_colfile (
    pid bigint NOT NULL,
    res_id character varying(100) NOT NULL,
    collection_pid bigint NOT NULL
);


--
-- TOC entry 224 (class 1259 OID 559642)
-- Name: hfj_blk_export_collection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_blk_export_collection (
    pid bigint NOT NULL,
    type_filter character varying(1000),
    res_type character varying(40) NOT NULL,
    optlock integer NOT NULL,
    job_pid bigint NOT NULL
);


--
-- TOC entry 225 (class 1259 OID 559651)
-- Name: hfj_blk_export_job; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_blk_export_job (
    pid bigint NOT NULL,
    created_time timestamp(6) without time zone NOT NULL,
    exp_time timestamp(6) without time zone,
    job_id character varying(36) NOT NULL,
    request character varying(1024) NOT NULL,
    exp_since timestamp(6) without time zone,
    job_status character varying(10) NOT NULL,
    status_message character varying(500),
    status_time timestamp(6) without time zone NOT NULL,
    optlock integer NOT NULL
);


--
-- TOC entry 226 (class 1259 OID 559663)
-- Name: hfj_blk_import_job; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_blk_import_job (
    pid bigint NOT NULL,
    batch_size integer NOT NULL,
    file_count integer NOT NULL,
    job_desc character varying(500),
    job_id character varying(36) NOT NULL,
    row_processing_mode character varying(20) NOT NULL,
    job_status character varying(10) NOT NULL,
    status_message character varying(500),
    status_time timestamp(6) without time zone NOT NULL,
    optlock integer NOT NULL
);


--
-- TOC entry 227 (class 1259 OID 559676)
-- Name: hfj_blk_import_jobfile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_blk_import_jobfile (
    pid bigint NOT NULL,
    job_contents oid,
    job_contents_vc text,
    file_description character varying(500),
    file_seq integer NOT NULL,
    tenant_name character varying(200),
    job_pid bigint NOT NULL
);


--
-- TOC entry 228 (class 1259 OID 559684)
-- Name: hfj_forced_id; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_forced_id (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    forced_id character varying(100) NOT NULL,
    resource_pid bigint NOT NULL,
    resource_type character varying(100) DEFAULT ''::character varying
);


--
-- TOC entry 229 (class 1259 OID 559691)
-- Name: hfj_history_tag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_history_tag (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    tag_id bigint,
    res_ver_pid bigint NOT NULL,
    res_id bigint NOT NULL,
    res_type character varying(40) NOT NULL,
    res_type_id smallint
);


--
-- TOC entry 230 (class 1259 OID 559698)
-- Name: hfj_idx_cmb_tok_nu; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_idx_cmb_tok_nu (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    hash_complete bigint NOT NULL,
    idx_string character varying(500) NOT NULL,
    res_id bigint
);


--
-- TOC entry 231 (class 1259 OID 559706)
-- Name: hfj_idx_cmp_string_uniq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_idx_cmp_string_uniq (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    hash_complete bigint,
    hash_complete_2 bigint,
    idx_string character varying(500) NOT NULL,
    res_id bigint
);


--
-- TOC entry 232 (class 1259 OID 559713)
-- Name: hfj_partition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_partition (
    part_id integer NOT NULL,
    part_desc character varying(200),
    part_name character varying(200) NOT NULL
);


--
-- TOC entry 233 (class 1259 OID 559718)
-- Name: hfj_res_link; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_res_link (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    src_path character varying(500) NOT NULL,
    src_resource_id bigint NOT NULL,
    source_resource_type character varying(40) NOT NULL,
    src_res_type_id smallint,
    target_res_partition_date date,
    target_res_partition_id integer,
    target_resource_id bigint,
    target_resource_type character varying(40) NOT NULL,
    target_res_type_id smallint,
    target_resource_url character varying(200),
    target_resource_version bigint,
    sp_updated timestamp(6) without time zone
);


--
-- TOC entry 234 (class 1259 OID 559728)
-- Name: hfj_res_param_present; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_res_param_present (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    hash_presence bigint,
    sp_present boolean NOT NULL,
    res_id bigint NOT NULL
);


--
-- TOC entry 235 (class 1259 OID 559734)
-- Name: hfj_res_reindex_job; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_res_reindex_job (
    pid bigint NOT NULL,
    job_deleted boolean NOT NULL,
    reindex_count integer,
    res_type character varying(100),
    suspended_until timestamp(6) without time zone,
    update_threshold_high timestamp(6) without time zone NOT NULL,
    update_threshold_low timestamp(6) without time zone
);


--
-- TOC entry 236 (class 1259 OID 559740)
-- Name: hfj_res_search_url; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_res_search_url (
    res_search_url character varying(768) NOT NULL,
    partition_id integer NOT NULL,
    created_time timestamp(6) without time zone NOT NULL,
    partition_date date,
    res_id bigint NOT NULL
);


--
-- TOC entry 237 (class 1259 OID 559749)
-- Name: hfj_res_tag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_res_tag (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    tag_id bigint,
    res_id bigint,
    res_type character varying(40) NOT NULL,
    res_type_id smallint
);


--
-- TOC entry 238 (class 1259 OID 559754)
-- Name: hfj_res_ver; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_res_ver (
    partition_id integer,
    pid bigint NOT NULL,
    res_deleted_at timestamp(6) without time zone,
    res_version character varying(7),
    has_tags boolean NOT NULL,
    res_published timestamp(6) without time zone NOT NULL,
    res_updated timestamp(6) without time zone NOT NULL,
    res_encoding character varying(5) NOT NULL,
    partition_date date,
    request_id character varying(16),
    res_text oid,
    res_id bigint NOT NULL,
    res_text_vc text,
    res_type character varying(40) NOT NULL,
    res_type_id smallint,
    res_ver bigint NOT NULL,
    source_uri character varying(768)
);


--
-- TOC entry 239 (class 1259 OID 559767)
-- Name: hfj_res_ver_prov; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_res_ver_prov (
    res_ver_pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    request_id character varying(16),
    res_pid bigint NOT NULL,
    source_uri character varying(768)
);


--
-- TOC entry 240 (class 1259 OID 559774)
-- Name: hfj_resource; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_resource (
    res_id bigint NOT NULL,
    partition_id integer,
    res_deleted_at timestamp(6) without time zone,
    res_version character varying(7),
    has_tags boolean NOT NULL,
    res_published timestamp(6) without time zone NOT NULL,
    res_updated timestamp(6) without time zone NOT NULL,
    fhir_id character varying(64),
    sp_has_links boolean NOT NULL,
    hash_sha256 character varying(64),
    sp_index_status smallint,
    res_language character varying(20),
    sp_cmpstr_uniq_present boolean,
    sp_cmptoks_present boolean,
    sp_coords_present boolean NOT NULL,
    sp_date_present boolean NOT NULL,
    sp_number_present boolean NOT NULL,
    sp_quantity_nrml_present boolean NOT NULL,
    sp_quantity_present boolean NOT NULL,
    sp_string_present boolean NOT NULL,
    sp_token_present boolean NOT NULL,
    sp_uri_present boolean NOT NULL,
    partition_date date,
    res_type character varying(40) NOT NULL,
    res_type_id smallint,
    search_url_present boolean,
    res_ver bigint NOT NULL
);


--
-- TOC entry 241 (class 1259 OID 559792)
-- Name: hfj_resource_modified; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_resource_modified (
    res_id character varying(256) NOT NULL,
    resource_type character varying(40) NOT NULL,
    res_ver character varying(8) NOT NULL,
    created_time timestamp(6) without time zone NOT NULL,
    summary_message character varying(4000) NOT NULL
);


--
-- TOC entry 242 (class 1259 OID 559802)
-- Name: hfj_resource_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_resource_type (
    res_type_id smallint NOT NULL,
    res_type character varying(100) NOT NULL
);


--
-- TOC entry 243 (class 1259 OID 559807)
-- Name: hfj_revinfo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_revinfo (
    rev bigint NOT NULL,
    revtstmp timestamp(6) without time zone
);


--
-- TOC entry 244 (class 1259 OID 559811)
-- Name: hfj_search; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_search (
    pid bigint NOT NULL,
    created timestamp(6) without time zone NOT NULL,
    search_deleted boolean,
    expiry_or_null timestamp(6) without time zone,
    failure_code integer,
    failure_message character varying(500),
    last_updated_high timestamp(6) without time zone,
    last_updated_low timestamp(6) without time zone,
    num_blocked integer,
    num_found integer NOT NULL,
    partition_id integer,
    preferred_page_size integer,
    resource_id bigint,
    resource_type character varying(200),
    search_param_map oid,
    search_param_map_bin bytea,
    search_query_string oid,
    search_query_string_hash integer,
    search_query_string_vc text,
    search_type integer NOT NULL,
    search_status character varying(10) NOT NULL,
    total_count integer,
    search_uuid character varying(48) NOT NULL,
    optlock_version integer
);


--
-- TOC entry 245 (class 1259 OID 559822)
-- Name: hfj_search_include; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_search_include (
    pid bigint NOT NULL,
    search_include character varying(200) NOT NULL,
    inc_recurse boolean NOT NULL,
    revinclude boolean NOT NULL,
    search_pid bigint NOT NULL
);


--
-- TOC entry 246 (class 1259 OID 559830)
-- Name: hfj_search_result; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_search_result (
    pid bigint NOT NULL,
    search_order integer NOT NULL,
    resource_partition_id integer,
    resource_pid bigint NOT NULL,
    search_pid bigint NOT NULL
);


--
-- TOC entry 247 (class 1259 OID 559837)
-- Name: hfj_spidx_coords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_spidx_coords (
    sp_id bigint NOT NULL,
    partition_id integer,
    partition_date date,
    hash_identity bigint,
    sp_missing boolean NOT NULL,
    sp_name character varying(100),
    res_id bigint NOT NULL,
    res_type character varying(100),
    sp_updated timestamp(6) without time zone,
    sp_latitude double precision,
    sp_longitude double precision
);


--
-- TOC entry 248 (class 1259 OID 559843)
-- Name: hfj_spidx_date; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_spidx_date (
    sp_id bigint NOT NULL,
    partition_id integer,
    partition_date date,
    hash_identity bigint,
    sp_missing boolean NOT NULL,
    sp_name character varying(100),
    res_id bigint NOT NULL,
    res_type character varying(100),
    sp_updated timestamp(6) without time zone,
    sp_value_high timestamp(6) without time zone,
    sp_value_high_date_ordinal integer,
    sp_value_low timestamp(6) without time zone,
    sp_value_low_date_ordinal integer
);


--
-- TOC entry 249 (class 1259 OID 559849)
-- Name: hfj_spidx_identity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_spidx_identity (
    sp_identity_id integer NOT NULL,
    hash_identity bigint NOT NULL,
    sp_name character varying(256) NOT NULL,
    res_type character varying(100) NOT NULL
);


--
-- TOC entry 250 (class 1259 OID 559856)
-- Name: hfj_spidx_number; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_spidx_number (
    sp_id bigint NOT NULL,
    partition_id integer,
    partition_date date,
    hash_identity bigint,
    sp_missing boolean NOT NULL,
    sp_name character varying(100),
    res_id bigint NOT NULL,
    res_type character varying(100),
    sp_updated timestamp(6) without time zone,
    sp_value numeric(19,2)
);


--
-- TOC entry 251 (class 1259 OID 559862)
-- Name: hfj_spidx_quantity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_spidx_quantity (
    sp_id bigint NOT NULL,
    partition_id integer,
    partition_date date,
    hash_identity bigint,
    sp_missing boolean NOT NULL,
    sp_name character varying(100),
    res_id bigint NOT NULL,
    res_type character varying(100),
    sp_updated timestamp(6) without time zone,
    hash_identity_and_units bigint,
    hash_identity_sys_units bigint,
    sp_system character varying(200),
    sp_units character varying(200),
    sp_value double precision
);


--
-- TOC entry 252 (class 1259 OID 559870)
-- Name: hfj_spidx_quantity_nrml; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_spidx_quantity_nrml (
    sp_id bigint NOT NULL,
    partition_id integer,
    partition_date date,
    hash_identity bigint,
    sp_missing boolean NOT NULL,
    sp_name character varying(100),
    res_id bigint NOT NULL,
    res_type character varying(100),
    sp_updated timestamp(6) without time zone,
    hash_identity_and_units bigint,
    hash_identity_sys_units bigint,
    sp_system character varying(200),
    sp_units character varying(200),
    sp_value double precision
);


--
-- TOC entry 253 (class 1259 OID 559878)
-- Name: hfj_spidx_string; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_spidx_string (
    sp_id bigint NOT NULL,
    partition_id integer,
    partition_date date,
    hash_identity bigint,
    sp_missing boolean NOT NULL,
    sp_name character varying(100),
    res_id bigint NOT NULL,
    res_type character varying(100),
    sp_updated timestamp(6) without time zone,
    hash_exact bigint,
    hash_norm_prefix bigint,
    sp_value_exact character varying(768),
    sp_value_normalized character varying(768)
);


--
-- TOC entry 254 (class 1259 OID 559886)
-- Name: hfj_spidx_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_spidx_token (
    sp_id bigint NOT NULL,
    partition_id integer,
    partition_date date,
    hash_identity bigint,
    sp_missing boolean NOT NULL,
    sp_name character varying(100),
    res_id bigint NOT NULL,
    res_type character varying(100),
    sp_updated timestamp(6) without time zone,
    hash_sys bigint,
    hash_sys_and_value bigint,
    hash_value bigint,
    sp_system character varying(200),
    sp_value character varying(200)
);


--
-- TOC entry 255 (class 1259 OID 559894)
-- Name: hfj_spidx_uri; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_spidx_uri (
    sp_id bigint NOT NULL,
    partition_id integer,
    partition_date date,
    hash_identity bigint,
    sp_missing boolean NOT NULL,
    sp_name character varying(100),
    res_id bigint NOT NULL,
    res_type character varying(100),
    sp_updated timestamp(6) without time zone,
    hash_uri bigint,
    sp_uri character varying(500)
);


--
-- TOC entry 256 (class 1259 OID 559902)
-- Name: hfj_subscription_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_subscription_stats (
    pid bigint NOT NULL,
    created_time timestamp(6) without time zone NOT NULL,
    res_id bigint
);


--
-- TOC entry 257 (class 1259 OID 559907)
-- Name: hfj_tag_def; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hfj_tag_def (
    tag_id bigint NOT NULL,
    tag_code character varying(200),
    tag_display character varying(200),
    tag_system character varying(200),
    tag_type integer NOT NULL,
    tag_user_selected boolean,
    tag_version character varying(30)
);


--
-- TOC entry 258 (class 1259 OID 559914)
-- Name: mpi_link; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mpi_link (
    pid bigint NOT NULL,
    partition_date date,
    partition_id integer,
    created timestamp(6) without time zone NOT NULL,
    eid_match boolean,
    golden_resource_partition_id integer,
    golden_resource_pid bigint NOT NULL,
    new_person boolean,
    link_source integer NOT NULL,
    match_result integer NOT NULL,
    target_type character varying(40),
    person_partition_id integer,
    person_pid bigint NOT NULL,
    rule_count bigint,
    score double precision,
    target_partition_id integer,
    target_pid bigint NOT NULL,
    updated timestamp(6) without time zone NOT NULL,
    vector bigint,
    version character varying(16) NOT NULL
);


--
-- TOC entry 259 (class 1259 OID 559926)
-- Name: mpi_link_aud; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mpi_link_aud (
    pid bigint NOT NULL,
    rev bigint NOT NULL,
    revtype smallint,
    partition_date date,
    partition_id integer,
    created timestamp(6) without time zone,
    eid_match boolean,
    golden_resource_partition_id integer,
    golden_resource_pid bigint,
    new_person boolean,
    link_source integer,
    match_result integer,
    target_type character varying(40),
    person_partition_id integer,
    person_pid bigint,
    rule_count bigint,
    score double precision,
    target_partition_id integer,
    target_pid bigint,
    updated timestamp(6) without time zone,
    vector bigint,
    version character varying(16)
);


--
-- TOC entry 260 (class 1259 OID 559931)
-- Name: node_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_relations (
    relation_id character varying(64) NOT NULL,
    source_node_id character varying(64),
    target_node_id character varying(64),
    relationship_type character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp without time zone,
    CONSTRAINT chk_relationship_type CHECK (((relationship_type)::text = ANY (ARRAY[('association'::character varying)::text, ('documents'::character varying)::text, ('derives_from'::character varying)::text, ('follows'::character varying)::text, ('references'::character varying)::text, ('contains'::character varying)::text, ('causes'::character varying)::text])))
);


--
-- TOC entry 261 (class 1259 OID 559939)
-- Name: npm_package; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.npm_package (
    pid bigint NOT NULL,
    cur_version_id character varying(200),
    package_desc character varying(512),
    package_id character varying(200) NOT NULL,
    updated_time timestamp(6) without time zone NOT NULL
);


--
-- TOC entry 262 (class 1259 OID 559947)
-- Name: npm_package_ver; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.npm_package_ver (
    pid bigint NOT NULL,
    pkg_author character varying(512),
    author_upper character varying(512),
    current_version boolean NOT NULL,
    pkg_desc character varying(512),
    desc_upper character varying(512),
    fhir_version character varying(10) NOT NULL,
    fhir_version_id character varying(20) NOT NULL,
    partition_id integer,
    binary_res_id bigint NOT NULL,
    package_id character varying(200) NOT NULL,
    package_size_bytes bigint NOT NULL,
    saved_time timestamp(6) without time zone NOT NULL,
    updated_time timestamp(6) without time zone NOT NULL,
    version_id character varying(200) NOT NULL,
    package_pid bigint NOT NULL
);


--
-- TOC entry 263 (class 1259 OID 559963)
-- Name: npm_package_ver_res; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.npm_package_ver_res (
    pid bigint NOT NULL,
    canonical_url character varying(200),
    canonical_version character varying(200),
    file_dir character varying(200),
    fhir_version character varying(10) NOT NULL,
    fhir_version_id character varying(20) NOT NULL,
    file_name character varying(200),
    partition_id integer,
    res_size_bytes bigint NOT NULL,
    binary_res_id bigint NOT NULL,
    res_type character varying(40) NOT NULL,
    updated_time timestamp(6) without time zone NOT NULL,
    packver_pid bigint NOT NULL
);


--
-- TOC entry 264 (class 1259 OID 559976)
-- Name: seq_blkexcol_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_blkexcol_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 265 (class 1259 OID 559977)
-- Name: seq_blkexcolfile_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_blkexcolfile_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 266 (class 1259 OID 559978)
-- Name: seq_blkexjob_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_blkexjob_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 267 (class 1259 OID 559979)
-- Name: seq_blkimjob_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_blkimjob_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 268 (class 1259 OID 559980)
-- Name: seq_blkimjobfile_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_blkimjobfile_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 269 (class 1259 OID 559981)
-- Name: seq_cncpt_map_grp_elm_tgt_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_cncpt_map_grp_elm_tgt_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 270 (class 1259 OID 559982)
-- Name: seq_codesystem_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_codesystem_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 271 (class 1259 OID 559983)
-- Name: seq_codesystemver_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_codesystemver_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 272 (class 1259 OID 559984)
-- Name: seq_concept_desig_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_concept_desig_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 273 (class 1259 OID 559985)
-- Name: seq_concept_map_group_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_concept_map_group_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 274 (class 1259 OID 559986)
-- Name: seq_concept_map_grp_elm_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_concept_map_grp_elm_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 275 (class 1259 OID 559987)
-- Name: seq_concept_map_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_concept_map_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 276 (class 1259 OID 559988)
-- Name: seq_concept_pc_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_concept_pc_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 277 (class 1259 OID 559989)
-- Name: seq_concept_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_concept_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 278 (class 1259 OID 559990)
-- Name: seq_concept_prop_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_concept_prop_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 279 (class 1259 OID 559991)
-- Name: seq_empi_link_id; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_empi_link_id
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 280 (class 1259 OID 559992)
-- Name: seq_forcedid_id; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_forcedid_id
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 281 (class 1259 OID 559993)
-- Name: seq_hfj_revinfo; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_hfj_revinfo
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 282 (class 1259 OID 559994)
-- Name: seq_historytag_id; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_historytag_id
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 283 (class 1259 OID 559995)
-- Name: seq_idxcmbtoknu_id; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_idxcmbtoknu_id
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 284 (class 1259 OID 559996)
-- Name: seq_idxcmpstruniq_id; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_idxcmpstruniq_id
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 285 (class 1259 OID 559997)
-- Name: seq_npm_pack; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_npm_pack
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 286 (class 1259 OID 559998)
-- Name: seq_npm_packver; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_npm_packver
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 287 (class 1259 OID 559999)
-- Name: seq_npm_packverres; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_npm_packverres
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 288 (class 1259 OID 560000)
-- Name: seq_res_reindex_job; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_res_reindex_job
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 289 (class 1259 OID 560001)
-- Name: seq_reslink_id; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_reslink_id
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 290 (class 1259 OID 560002)
-- Name: seq_resource_history_id; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_resource_history_id
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 291 (class 1259 OID 560003)
-- Name: seq_resource_id; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_resource_id
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 292 (class 1259 OID 560004)
-- Name: seq_resource_type; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_resource_type
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 293 (class 1259 OID 560005)
-- Name: seq_resparmpresent_id; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_resparmpresent_id
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 294 (class 1259 OID 560006)
-- Name: seq_restag_id; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_restag_id
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 295 (class 1259 OID 560007)
-- Name: seq_search; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_search
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 296 (class 1259 OID 560008)
-- Name: seq_search_inc; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_search_inc
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 297 (class 1259 OID 560009)
-- Name: seq_search_res; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_search_res
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 298 (class 1259 OID 560010)
-- Name: seq_spidx_coords; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_spidx_coords
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 299 (class 1259 OID 560011)
-- Name: seq_spidx_date; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_spidx_date
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 300 (class 1259 OID 560012)
-- Name: seq_spidx_identity; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_spidx_identity
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 301 (class 1259 OID 560013)
-- Name: seq_spidx_number; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_spidx_number
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 302 (class 1259 OID 560014)
-- Name: seq_spidx_quantity; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_spidx_quantity
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 303 (class 1259 OID 560015)
-- Name: seq_spidx_quantity_nrml; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_spidx_quantity_nrml
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 304 (class 1259 OID 560016)
-- Name: seq_spidx_string; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_spidx_string
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 305 (class 1259 OID 560017)
-- Name: seq_spidx_token; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_spidx_token
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 306 (class 1259 OID 560018)
-- Name: seq_spidx_uri; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_spidx_uri
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 307 (class 1259 OID 560019)
-- Name: seq_subscription_id; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_subscription_id
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 308 (class 1259 OID 560020)
-- Name: seq_tagdef_id; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_tagdef_id
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 309 (class 1259 OID 560021)
-- Name: seq_valueset_c_dsgntn_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_valueset_c_dsgntn_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 310 (class 1259 OID 560022)
-- Name: seq_valueset_concept_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_valueset_concept_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 311 (class 1259 OID 560023)
-- Name: seq_valueset_pid; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_valueset_pid
    START WITH 1
    INCREMENT BY 50
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 312 (class 1259 OID 560024)
-- Name: trm_codesystem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_codesystem (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    code_system_uri character varying(200) NOT NULL,
    current_version_partition_id integer,
    current_version_pid bigint,
    cs_name character varying(200),
    res_id bigint NOT NULL
);


--
-- TOC entry 313 (class 1259 OID 560030)
-- Name: trm_codesystem_ver; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_codesystem_ver (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    cs_display character varying(200),
    codesystem_pid bigint,
    cs_version_id character varying(200),
    res_id bigint NOT NULL
);


--
-- TOC entry 314 (class 1259 OID 560035)
-- Name: trm_concept; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_concept (
    pid bigint NOT NULL,
    partition_id integer,
    codeval character varying(500) NOT NULL,
    codesystem_pid bigint NOT NULL,
    display character varying(400),
    index_status smallint,
    parent_pids oid,
    parent_pids_vc text,
    code_sequence integer,
    concept_updated timestamp(6) without time zone
);


--
-- TOC entry 315 (class 1259 OID 560043)
-- Name: trm_concept_desig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_concept_desig (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    concept_pid bigint NOT NULL,
    lang character varying(500),
    use_code character varying(500),
    use_display character varying(500),
    use_system character varying(500),
    val character varying(2000),
    val_vc text,
    cs_ver_pid bigint NOT NULL
);


--
-- TOC entry 316 (class 1259 OID 560051)
-- Name: trm_concept_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_concept_map (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    res_id bigint NOT NULL,
    source_url character varying(200),
    target_url character varying(200),
    url character varying(200) NOT NULL,
    ver character varying(200)
);


--
-- TOC entry 317 (class 1259 OID 560059)
-- Name: trm_concept_map_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_concept_map_group (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    concept_map_pid bigint NOT NULL,
    concept_map_url character varying(200),
    source_url character varying(200) NOT NULL,
    source_vs character varying(200),
    source_version character varying(200),
    target_url character varying(200) NOT NULL,
    target_vs character varying(200),
    target_version character varying(200)
);


--
-- TOC entry 318 (class 1259 OID 560068)
-- Name: trm_concept_map_grp_element; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_concept_map_grp_element (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    source_code character varying(500) NOT NULL,
    concept_map_group_pid bigint NOT NULL,
    concept_map_url character varying(200),
    source_display character varying(500),
    system_url character varying(200),
    system_version character varying(200),
    valueset_url character varying(200)
);


--
-- TOC entry 319 (class 1259 OID 560076)
-- Name: trm_concept_map_grp_elm_tgt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_concept_map_grp_elm_tgt (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    target_code character varying(500),
    concept_map_grp_elm_pid bigint NOT NULL,
    concept_map_url character varying(200),
    target_display character varying(500),
    target_equivalence character varying(50),
    system_url character varying(200),
    system_version character varying(200),
    valueset_url character varying(200)
);


--
-- TOC entry 320 (class 1259 OID 560083)
-- Name: trm_concept_pc_link; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_concept_pc_link (
    pid bigint NOT NULL,
    partition_id integer,
    child_pid bigint NOT NULL,
    codesystem_pid bigint NOT NULL,
    parent_pid bigint NOT NULL,
    rel_type integer
);


--
-- TOC entry 321 (class 1259 OID 560090)
-- Name: trm_concept_property; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_concept_property (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    prop_codesystem character varying(500),
    cs_ver_pid bigint,
    concept_pid bigint NOT NULL,
    prop_display character varying(500),
    prop_key character varying(500) NOT NULL,
    prop_type integer NOT NULL,
    prop_val character varying(500),
    prop_val_bin bytea,
    prop_val_lob oid
);


--
-- TOC entry 322 (class 1259 OID 560099)
-- Name: trm_valueset; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_valueset (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    expansion_status character varying(50) NOT NULL,
    expanded_at timestamp(6) without time zone,
    vsname character varying(200),
    res_id bigint NOT NULL,
    total_concept_designations bigint DEFAULT 0 NOT NULL,
    total_concepts bigint DEFAULT 0 NOT NULL,
    url character varying(200) NOT NULL,
    ver character varying(200)
);


--
-- TOC entry 323 (class 1259 OID 560112)
-- Name: trm_valueset_c_designation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_valueset_c_designation (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    valueset_concept_pid bigint NOT NULL,
    lang character varying(500),
    use_code character varying(500),
    use_display character varying(500),
    use_system character varying(500),
    val character varying(2000) NOT NULL,
    valueset_pid bigint NOT NULL
);


--
-- TOC entry 324 (class 1259 OID 560121)
-- Name: trm_valueset_concept; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trm_valueset_concept (
    pid bigint NOT NULL,
    partition_id integer,
    partition_date date,
    codeval character varying(500) NOT NULL,
    display character varying(400),
    index_status bigint,
    valueset_order integer NOT NULL,
    source_direct_parent_pids oid,
    source_direct_parent_pids_vc text,
    source_pid bigint,
    system_url character varying(200) NOT NULL,
    system_ver character varying(200),
    valueset_pid bigint NOT NULL
);


--
-- TOC entry 3565 (class 2606 OID 560132)
-- Name: bt2_job_instance bt2_job_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bt2_job_instance
    ADD CONSTRAINT bt2_job_instance_pkey PRIMARY KEY (id);


--
-- TOC entry 3568 (class 2606 OID 560134)
-- Name: bt2_work_chunk bt2_work_chunk_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bt2_work_chunk
    ADD CONSTRAINT bt2_work_chunk_pkey PRIMARY KEY (id);


--
-- TOC entry 3572 (class 2606 OID 560136)
-- Name: encounter_nodes encounter_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encounter_nodes
    ADD CONSTRAINT encounter_nodes_pkey PRIMARY KEY (encounter_fhir_id);


--
-- TOC entry 3582 (class 2606 OID 560138)
-- Name: hfj_binary_storage_blob hfj_binary_storage_blob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_binary_storage_blob
    ADD CONSTRAINT hfj_binary_storage_blob_pkey PRIMARY KEY (blob_id);


--
-- TOC entry 3584 (class 2606 OID 560140)
-- Name: hfj_blk_export_colfile hfj_blk_export_colfile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_blk_export_colfile
    ADD CONSTRAINT hfj_blk_export_colfile_pkey PRIMARY KEY (pid);


--
-- TOC entry 3586 (class 2606 OID 560142)
-- Name: hfj_blk_export_collection hfj_blk_export_collection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_blk_export_collection
    ADD CONSTRAINT hfj_blk_export_collection_pkey PRIMARY KEY (pid);


--
-- TOC entry 3588 (class 2606 OID 560144)
-- Name: hfj_blk_export_job hfj_blk_export_job_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_blk_export_job
    ADD CONSTRAINT hfj_blk_export_job_pkey PRIMARY KEY (pid);


--
-- TOC entry 3593 (class 2606 OID 560146)
-- Name: hfj_blk_import_job hfj_blk_import_job_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_blk_import_job
    ADD CONSTRAINT hfj_blk_import_job_pkey PRIMARY KEY (pid);


--
-- TOC entry 3597 (class 2606 OID 560148)
-- Name: hfj_blk_import_jobfile hfj_blk_import_jobfile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_blk_import_jobfile
    ADD CONSTRAINT hfj_blk_import_jobfile_pkey PRIMARY KEY (pid);


--
-- TOC entry 3600 (class 2606 OID 560150)
-- Name: hfj_forced_id hfj_forced_id_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_forced_id
    ADD CONSTRAINT hfj_forced_id_pkey PRIMARY KEY (pid);


--
-- TOC entry 3602 (class 2606 OID 560152)
-- Name: hfj_history_tag hfj_history_tag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_history_tag
    ADD CONSTRAINT hfj_history_tag_pkey PRIMARY KEY (pid);


--
-- TOC entry 3607 (class 2606 OID 560154)
-- Name: hfj_idx_cmb_tok_nu hfj_idx_cmb_tok_nu_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_idx_cmb_tok_nu
    ADD CONSTRAINT hfj_idx_cmb_tok_nu_pkey PRIMARY KEY (pid);


--
-- TOC entry 3612 (class 2606 OID 560156)
-- Name: hfj_idx_cmp_string_uniq hfj_idx_cmp_string_uniq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_idx_cmp_string_uniq
    ADD CONSTRAINT hfj_idx_cmp_string_uniq_pkey PRIMARY KEY (pid);


--
-- TOC entry 3617 (class 2606 OID 560158)
-- Name: hfj_partition hfj_partition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_partition
    ADD CONSTRAINT hfj_partition_pkey PRIMARY KEY (part_id);


--
-- TOC entry 3621 (class 2606 OID 560160)
-- Name: hfj_res_link hfj_res_link_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_link
    ADD CONSTRAINT hfj_res_link_pkey PRIMARY KEY (pid);


--
-- TOC entry 3625 (class 2606 OID 560162)
-- Name: hfj_res_param_present hfj_res_param_present_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_param_present
    ADD CONSTRAINT hfj_res_param_present_pkey PRIMARY KEY (pid);


--
-- TOC entry 3629 (class 2606 OID 560164)
-- Name: hfj_res_reindex_job hfj_res_reindex_job_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_reindex_job
    ADD CONSTRAINT hfj_res_reindex_job_pkey PRIMARY KEY (pid);


--
-- TOC entry 3631 (class 2606 OID 560166)
-- Name: hfj_res_search_url hfj_res_search_url_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_search_url
    ADD CONSTRAINT hfj_res_search_url_pkey PRIMARY KEY (res_search_url, partition_id);


--
-- TOC entry 3635 (class 2606 OID 560168)
-- Name: hfj_res_tag hfj_res_tag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_tag
    ADD CONSTRAINT hfj_res_tag_pkey PRIMARY KEY (pid);


--
-- TOC entry 3641 (class 2606 OID 560170)
-- Name: hfj_res_ver hfj_res_ver_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_ver
    ADD CONSTRAINT hfj_res_ver_pkey PRIMARY KEY (pid);


--
-- TOC entry 3649 (class 2606 OID 560172)
-- Name: hfj_res_ver_prov hfj_res_ver_prov_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_ver_prov
    ADD CONSTRAINT hfj_res_ver_prov_pkey PRIMARY KEY (res_ver_pid);


--
-- TOC entry 3662 (class 2606 OID 560174)
-- Name: hfj_resource_modified hfj_resource_modified_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_resource_modified
    ADD CONSTRAINT hfj_resource_modified_pkey PRIMARY KEY (res_id, resource_type, res_ver);


--
-- TOC entry 3654 (class 2606 OID 560176)
-- Name: hfj_resource hfj_resource_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_resource
    ADD CONSTRAINT hfj_resource_pkey PRIMARY KEY (res_id);


--
-- TOC entry 3664 (class 2606 OID 560178)
-- Name: hfj_resource_type hfj_resource_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_resource_type
    ADD CONSTRAINT hfj_resource_type_pkey PRIMARY KEY (res_type_id);


--
-- TOC entry 3668 (class 2606 OID 560180)
-- Name: hfj_revinfo hfj_revinfo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_revinfo
    ADD CONSTRAINT hfj_revinfo_pkey PRIMARY KEY (rev);


--
-- TOC entry 3677 (class 2606 OID 560182)
-- Name: hfj_search_include hfj_search_include_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_search_include
    ADD CONSTRAINT hfj_search_include_pkey PRIMARY KEY (pid);


--
-- TOC entry 3670 (class 2606 OID 560184)
-- Name: hfj_search hfj_search_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_search
    ADD CONSTRAINT hfj_search_pkey PRIMARY KEY (pid);


--
-- TOC entry 3679 (class 2606 OID 560186)
-- Name: hfj_search_result hfj_search_result_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_search_result
    ADD CONSTRAINT hfj_search_result_pkey PRIMARY KEY (pid);


--
-- TOC entry 3683 (class 2606 OID 560188)
-- Name: hfj_spidx_coords hfj_spidx_coords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_coords
    ADD CONSTRAINT hfj_spidx_coords_pkey PRIMARY KEY (sp_id);


--
-- TOC entry 3688 (class 2606 OID 560190)
-- Name: hfj_spidx_date hfj_spidx_date_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_date
    ADD CONSTRAINT hfj_spidx_date_pkey PRIMARY KEY (sp_id);


--
-- TOC entry 3695 (class 2606 OID 560192)
-- Name: hfj_spidx_identity hfj_spidx_identity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_identity
    ADD CONSTRAINT hfj_spidx_identity_pkey PRIMARY KEY (sp_identity_id);


--
-- TOC entry 3699 (class 2606 OID 560194)
-- Name: hfj_spidx_number hfj_spidx_number_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_number
    ADD CONSTRAINT hfj_spidx_number_pkey PRIMARY KEY (sp_id);


--
-- TOC entry 3709 (class 2606 OID 560196)
-- Name: hfj_spidx_quantity_nrml hfj_spidx_quantity_nrml_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_quantity_nrml
    ADD CONSTRAINT hfj_spidx_quantity_nrml_pkey PRIMARY KEY (sp_id);


--
-- TOC entry 3703 (class 2606 OID 560198)
-- Name: hfj_spidx_quantity hfj_spidx_quantity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_quantity
    ADD CONSTRAINT hfj_spidx_quantity_pkey PRIMARY KEY (sp_id);


--
-- TOC entry 3715 (class 2606 OID 560200)
-- Name: hfj_spidx_string hfj_spidx_string_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_string
    ADD CONSTRAINT hfj_spidx_string_pkey PRIMARY KEY (sp_id);


--
-- TOC entry 3721 (class 2606 OID 560202)
-- Name: hfj_spidx_token hfj_spidx_token_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_token
    ADD CONSTRAINT hfj_spidx_token_pkey PRIMARY KEY (sp_id);


--
-- TOC entry 3728 (class 2606 OID 560204)
-- Name: hfj_spidx_uri hfj_spidx_uri_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_uri
    ADD CONSTRAINT hfj_spidx_uri_pkey PRIMARY KEY (sp_id);


--
-- TOC entry 3733 (class 2606 OID 560206)
-- Name: hfj_subscription_stats hfj_subscription_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_subscription_stats
    ADD CONSTRAINT hfj_subscription_stats_pkey PRIMARY KEY (pid);


--
-- TOC entry 3737 (class 2606 OID 560208)
-- Name: hfj_tag_def hfj_tag_def_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_tag_def
    ADD CONSTRAINT hfj_tag_def_pkey PRIMARY KEY (tag_id);


--
-- TOC entry 3591 (class 2606 OID 560210)
-- Name: hfj_blk_export_job idx_blkex_job_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_blk_export_job
    ADD CONSTRAINT idx_blkex_job_id UNIQUE (job_id);


--
-- TOC entry 3595 (class 2606 OID 560212)
-- Name: hfj_blk_import_job idx_blkim_job_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_blk_import_job
    ADD CONSTRAINT idx_blkim_job_id UNIQUE (job_id);


--
-- TOC entry 3779 (class 2606 OID 560214)
-- Name: trm_codesystem_ver idx_codesystem_and_ver; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_codesystem_ver
    ADD CONSTRAINT idx_codesystem_and_ver UNIQUE (codesystem_pid, cs_version_id);


--
-- TOC entry 3783 (class 2606 OID 560216)
-- Name: trm_concept idx_concept_cs_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept
    ADD CONSTRAINT idx_concept_cs_code UNIQUE (codesystem_pid, codeval);


--
-- TOC entry 3794 (class 2606 OID 560218)
-- Name: trm_concept_map idx_concept_map_url; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_map
    ADD CONSTRAINT idx_concept_map_url UNIQUE (url, ver);


--
-- TOC entry 3773 (class 2606 OID 560220)
-- Name: trm_codesystem idx_cs_codesystem; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_codesystem
    ADD CONSTRAINT idx_cs_codesystem UNIQUE (code_system_uri);


--
-- TOC entry 3743 (class 2606 OID 560222)
-- Name: mpi_link idx_empi_person_tgt; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpi_link
    ADD CONSTRAINT idx_empi_person_tgt UNIQUE (person_pid, target_pid);


--
-- TOC entry 3697 (class 2606 OID 560224)
-- Name: hfj_spidx_identity idx_hash_identity; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_identity
    ADD CONSTRAINT idx_hash_identity UNIQUE (hash_identity);


--
-- TOC entry 3615 (class 2606 OID 560226)
-- Name: hfj_idx_cmp_string_uniq idx_idxcmpstruniq_string; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_idx_cmp_string_uniq
    ADD CONSTRAINT idx_idxcmpstruniq_string UNIQUE (idx_string);


--
-- TOC entry 3756 (class 2606 OID 560228)
-- Name: npm_package idx_pack_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npm_package
    ADD CONSTRAINT idx_pack_id UNIQUE (package_id);


--
-- TOC entry 3762 (class 2606 OID 560230)
-- Name: npm_package_ver idx_packver; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npm_package_ver
    ADD CONSTRAINT idx_packver UNIQUE (package_id, version_id);


--
-- TOC entry 3619 (class 2606 OID 560232)
-- Name: hfj_partition idx_part_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_partition
    ADD CONSTRAINT idx_part_name UNIQUE (part_name);


--
-- TOC entry 3660 (class 2606 OID 560234)
-- Name: hfj_resource idx_res_type_fhir_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_resource
    ADD CONSTRAINT idx_res_type_fhir_id UNIQUE (res_type, fhir_id);


--
-- TOC entry 3666 (class 2606 OID 560236)
-- Name: hfj_resource_type idx_res_type_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_resource_type
    ADD CONSTRAINT idx_res_type_name UNIQUE (res_type);


--
-- TOC entry 3605 (class 2606 OID 560238)
-- Name: hfj_history_tag idx_reshisttag_tagid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_history_tag
    ADD CONSTRAINT idx_reshisttag_tagid UNIQUE (res_ver_pid, tag_id);


--
-- TOC entry 3639 (class 2606 OID 560240)
-- Name: hfj_res_tag idx_restag_tagid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_tag
    ADD CONSTRAINT idx_restag_tagid UNIQUE (res_id, tag_id);


--
-- TOC entry 3646 (class 2606 OID 560242)
-- Name: hfj_res_ver idx_resver_id_ver; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_ver
    ADD CONSTRAINT idx_resver_id_ver UNIQUE (res_id, res_ver);


--
-- TOC entry 3674 (class 2606 OID 560244)
-- Name: hfj_search idx_search_uuid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_search
    ADD CONSTRAINT idx_search_uuid UNIQUE (search_uuid);


--
-- TOC entry 3681 (class 2606 OID 560246)
-- Name: hfj_search_result idx_searchres_order; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_search_result
    ADD CONSTRAINT idx_searchres_order UNIQUE (search_pid, search_order);


--
-- TOC entry 3735 (class 2606 OID 560248)
-- Name: hfj_subscription_stats idx_subsc_resid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_subscription_stats
    ADD CONSTRAINT idx_subsc_resid UNIQUE (res_id);


--
-- TOC entry 3819 (class 2606 OID 560250)
-- Name: trm_valueset idx_valueset_url; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_valueset
    ADD CONSTRAINT idx_valueset_url UNIQUE (url, ver);


--
-- TOC entry 3827 (class 2606 OID 560252)
-- Name: trm_valueset_concept idx_vs_concept_cscd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_valueset_concept
    ADD CONSTRAINT idx_vs_concept_cscd UNIQUE (valueset_pid, system_url, codeval);


--
-- TOC entry 3829 (class 2606 OID 560254)
-- Name: trm_valueset_concept idx_vs_concept_order; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_valueset_concept
    ADD CONSTRAINT idx_vs_concept_order UNIQUE (valueset_pid, valueset_order);


--
-- TOC entry 3749 (class 2606 OID 560256)
-- Name: mpi_link_aud mpi_link_aud_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpi_link_aud
    ADD CONSTRAINT mpi_link_aud_pkey PRIMARY KEY (rev, pid);


--
-- TOC entry 3747 (class 2606 OID 560258)
-- Name: mpi_link mpi_link_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpi_link
    ADD CONSTRAINT mpi_link_pkey PRIMARY KEY (pid);


--
-- TOC entry 3754 (class 2606 OID 560260)
-- Name: node_relations node_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_relations
    ADD CONSTRAINT node_relations_pkey PRIMARY KEY (relation_id);


--
-- TOC entry 3758 (class 2606 OID 560262)
-- Name: npm_package npm_package_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npm_package
    ADD CONSTRAINT npm_package_pkey PRIMARY KEY (pid);


--
-- TOC entry 3764 (class 2606 OID 560264)
-- Name: npm_package_ver npm_package_ver_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npm_package_ver
    ADD CONSTRAINT npm_package_ver_pkey PRIMARY KEY (pid);


--
-- TOC entry 3769 (class 2606 OID 560266)
-- Name: npm_package_ver_res npm_package_ver_res_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npm_package_ver_res
    ADD CONSTRAINT npm_package_ver_res_pkey PRIMARY KEY (pid);


--
-- TOC entry 3775 (class 2606 OID 560268)
-- Name: trm_codesystem trm_codesystem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_codesystem
    ADD CONSTRAINT trm_codesystem_pkey PRIMARY KEY (pid);


--
-- TOC entry 3781 (class 2606 OID 560270)
-- Name: trm_codesystem_ver trm_codesystem_ver_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_codesystem_ver
    ADD CONSTRAINT trm_codesystem_ver_pkey PRIMARY KEY (pid);


--
-- TOC entry 3791 (class 2606 OID 560272)
-- Name: trm_concept_desig trm_concept_desig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_desig
    ADD CONSTRAINT trm_concept_desig_pkey PRIMARY KEY (pid);


--
-- TOC entry 3799 (class 2606 OID 560274)
-- Name: trm_concept_map_group trm_concept_map_group_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_map_group
    ADD CONSTRAINT trm_concept_map_group_pkey PRIMARY KEY (pid);


--
-- TOC entry 3803 (class 2606 OID 560276)
-- Name: trm_concept_map_grp_element trm_concept_map_grp_element_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_map_grp_element
    ADD CONSTRAINT trm_concept_map_grp_element_pkey PRIMARY KEY (pid);


--
-- TOC entry 3807 (class 2606 OID 560278)
-- Name: trm_concept_map_grp_elm_tgt trm_concept_map_grp_elm_tgt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_map_grp_elm_tgt
    ADD CONSTRAINT trm_concept_map_grp_elm_tgt_pkey PRIMARY KEY (pid);


--
-- TOC entry 3796 (class 2606 OID 560280)
-- Name: trm_concept_map trm_concept_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_map
    ADD CONSTRAINT trm_concept_map_pkey PRIMARY KEY (pid);


--
-- TOC entry 3812 (class 2606 OID 560282)
-- Name: trm_concept_pc_link trm_concept_pc_link_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_pc_link
    ADD CONSTRAINT trm_concept_pc_link_pkey PRIMARY KEY (pid);


--
-- TOC entry 3787 (class 2606 OID 560284)
-- Name: trm_concept trm_concept_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept
    ADD CONSTRAINT trm_concept_pkey PRIMARY KEY (pid);


--
-- TOC entry 3816 (class 2606 OID 560286)
-- Name: trm_concept_property trm_concept_property_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_property
    ADD CONSTRAINT trm_concept_property_pkey PRIMARY KEY (pid);


--
-- TOC entry 3825 (class 2606 OID 560288)
-- Name: trm_valueset_c_designation trm_valueset_c_designation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_valueset_c_designation
    ADD CONSTRAINT trm_valueset_c_designation_pkey PRIMARY KEY (pid);


--
-- TOC entry 3831 (class 2606 OID 560290)
-- Name: trm_valueset_concept trm_valueset_concept_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_valueset_concept
    ADD CONSTRAINT trm_valueset_concept_pkey PRIMARY KEY (pid);


--
-- TOC entry 3821 (class 2606 OID 560292)
-- Name: trm_valueset trm_valueset_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_valueset
    ADD CONSTRAINT trm_valueset_pkey PRIMARY KEY (pid);


--
-- TOC entry 3776 (class 1259 OID 560293)
-- Name: fk_codesysver_cs_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_codesysver_cs_id ON public.trm_codesystem_ver USING btree (codesystem_pid);


--
-- TOC entry 3777 (class 1259 OID 560294)
-- Name: fk_codesysver_res_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_codesysver_res_id ON public.trm_codesystem_ver USING btree (res_id);


--
-- TOC entry 3788 (class 1259 OID 560295)
-- Name: fk_conceptdesig_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_conceptdesig_concept ON public.trm_concept_desig USING btree (concept_pid);


--
-- TOC entry 3789 (class 1259 OID 560296)
-- Name: fk_conceptdesig_csv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_conceptdesig_csv ON public.trm_concept_desig USING btree (cs_ver_pid);


--
-- TOC entry 3813 (class 1259 OID 560297)
-- Name: fk_conceptprop_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_conceptprop_concept ON public.trm_concept_property USING btree (concept_pid);


--
-- TOC entry 3814 (class 1259 OID 560298)
-- Name: fk_conceptprop_csv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_conceptprop_csv ON public.trm_concept_property USING btree (cs_ver_pid);


--
-- TOC entry 3739 (class 1259 OID 560299)
-- Name: fk_empi_link_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_empi_link_target ON public.mpi_link USING btree (target_pid);


--
-- TOC entry 3765 (class 1259 OID 560300)
-- Name: fk_npm_packverres_packver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_npm_packverres_packver ON public.npm_package_ver_res USING btree (packver_pid);


--
-- TOC entry 3759 (class 1259 OID 560301)
-- Name: fk_npm_pkv_pkg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_npm_pkv_pkg ON public.npm_package_ver USING btree (package_pid);


--
-- TOC entry 3760 (class 1259 OID 560302)
-- Name: fk_npm_pkv_resid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_npm_pkv_resid ON public.npm_package_ver USING btree (binary_res_id);


--
-- TOC entry 3766 (class 1259 OID 560304)
-- Name: fk_npm_pkvr_resid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_npm_pkvr_resid ON public.npm_package_ver_res USING btree (binary_res_id);


--
-- TOC entry 3675 (class 1259 OID 560305)
-- Name: fk_searchinc_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_searchinc_search ON public.hfj_search_include USING btree (search_pid);


--
-- TOC entry 3800 (class 1259 OID 560306)
-- Name: fk_tcmgelement_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_tcmgelement_group ON public.trm_concept_map_grp_element USING btree (concept_map_group_pid);


--
-- TOC entry 3804 (class 1259 OID 560307)
-- Name: fk_tcmgetarget_element; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_tcmgetarget_element ON public.trm_concept_map_grp_elm_tgt USING btree (concept_map_grp_elm_pid);


--
-- TOC entry 3797 (class 1259 OID 560308)
-- Name: fk_tcmgroup_conceptmap; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_tcmgroup_conceptmap ON public.trm_concept_map_group USING btree (concept_map_pid);


--
-- TOC entry 3808 (class 1259 OID 560309)
-- Name: fk_term_conceptpc_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_term_conceptpc_child ON public.trm_concept_pc_link USING btree (child_pid);


--
-- TOC entry 3809 (class 1259 OID 560310)
-- Name: fk_term_conceptpc_cs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_term_conceptpc_cs ON public.trm_concept_pc_link USING btree (codesystem_pid);


--
-- TOC entry 3810 (class 1259 OID 560311)
-- Name: fk_term_conceptpc_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_term_conceptpc_parent ON public.trm_concept_pc_link USING btree (parent_pid);


--
-- TOC entry 3822 (class 1259 OID 560312)
-- Name: fk_trm_valueset_concept_pid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_trm_valueset_concept_pid ON public.trm_valueset_c_designation USING btree (valueset_concept_pid);


--
-- TOC entry 3823 (class 1259 OID 560313)
-- Name: fk_trm_vscd_vs_pid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_trm_vscd_vs_pid ON public.trm_valueset_c_designation USING btree (valueset_pid);


--
-- TOC entry 3770 (class 1259 OID 560314)
-- Name: fk_trmcodesystem_curver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_trmcodesystem_curver ON public.trm_codesystem USING btree (current_version_pid);


--
-- TOC entry 3771 (class 1259 OID 560315)
-- Name: fk_trmcodesystem_res; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_trmcodesystem_res ON public.trm_codesystem USING btree (res_id);


--
-- TOC entry 3792 (class 1259 OID 560316)
-- Name: fk_trmconceptmap_res; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_trmconceptmap_res ON public.trm_concept_map USING btree (res_id);


--
-- TOC entry 3817 (class 1259 OID 560317)
-- Name: fk_trmvalueset_res; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fk_trmvalueset_res ON public.trm_valueset USING btree (res_id);


--
-- TOC entry 3589 (class 1259 OID 560318)
-- Name: idx_blkex_exptime; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blkex_exptime ON public.hfj_blk_export_job USING btree (exp_time);


--
-- TOC entry 3598 (class 1259 OID 560319)
-- Name: idx_blkim_jobfile_jobid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blkim_jobfile_jobid ON public.hfj_blk_import_jobfile USING btree (job_pid);


--
-- TOC entry 3566 (class 1259 OID 560320)
-- Name: idx_bt2ji_ct; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bt2ji_ct ON public.bt2_job_instance USING btree (create_time);


--
-- TOC entry 3569 (class 1259 OID 560321)
-- Name: idx_bt2wc_ii_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bt2wc_ii_seq ON public.bt2_work_chunk USING btree (instance_id, seq);


--
-- TOC entry 3570 (class 1259 OID 560322)
-- Name: idx_bt2wc_ii_si_s_seq_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bt2wc_ii_si_s_seq_id ON public.bt2_work_chunk USING btree (instance_id, tgt_step_id, stat, seq, id);


--
-- TOC entry 3801 (class 1259 OID 560323)
-- Name: idx_cncpt_map_grp_cd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cncpt_map_grp_cd ON public.trm_concept_map_grp_element USING btree (source_code);


--
-- TOC entry 3805 (class 1259 OID 560324)
-- Name: idx_cncpt_mp_grp_elm_tgt_cd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cncpt_mp_grp_elm_tgt_cd ON public.trm_concept_map_grp_elm_tgt USING btree (target_code);


--
-- TOC entry 3784 (class 1259 OID 560325)
-- Name: idx_concept_indexstatus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concept_indexstatus ON public.trm_concept USING btree (index_status);


--
-- TOC entry 3785 (class 1259 OID 560326)
-- Name: idx_concept_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concept_updated ON public.trm_concept USING btree (concept_updated);


--
-- TOC entry 3740 (class 1259 OID 560327)
-- Name: idx_empi_gr_tgt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empi_gr_tgt ON public.mpi_link USING btree (golden_resource_pid, target_pid);


--
-- TOC entry 3741 (class 1259 OID 560328)
-- Name: idx_empi_match_tgt_ver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empi_match_tgt_ver ON public.mpi_link USING btree (match_result, target_pid, version);


--
-- TOC entry 3744 (class 1259 OID 560329)
-- Name: idx_empi_tgt_mr_ls; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empi_tgt_mr_ls ON public.mpi_link USING btree (target_type, match_result, link_source);


--
-- TOC entry 3745 (class 1259 OID 560330)
-- Name: idx_empi_tgt_mr_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empi_tgt_mr_score ON public.mpi_link USING btree (target_type, match_result, score);


--
-- TOC entry 3573 (class 1259 OID 560331)
-- Name: idx_enc_nodes_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enc_nodes_patient ON public.encounter_nodes USING btree (patient_id);


--
-- TOC entry 3574 (class 1259 OID 560332)
-- Name: idx_enc_nodes_patient_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enc_nodes_patient_active ON public.encounter_nodes USING btree (patient_id, event_date DESC) WHERE (is_deleted = false);


--
-- TOC entry 3575 (class 1259 OID 560333)
-- Name: idx_enc_nodes_patient_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enc_nodes_patient_category ON public.encounter_nodes USING btree (patient_id, category, created_at DESC) WHERE (is_deleted = false);


--
-- TOC entry 3576 (class 1259 OID 560334)
-- Name: idx_encounter_nodes_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encounter_nodes_category ON public.encounter_nodes USING btree (patient_id, category) WHERE (is_deleted = false);


--
-- TOC entry 3577 (class 1259 OID 560335)
-- Name: idx_encounter_nodes_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encounter_nodes_deleted ON public.encounter_nodes USING btree (is_deleted, patient_id) WHERE (is_deleted = false);


--
-- TOC entry 3578 (class 1259 OID 560336)
-- Name: idx_encounter_nodes_event_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encounter_nodes_event_date ON public.encounter_nodes USING btree (patient_id, event_date DESC) WHERE (is_deleted = false);


--
-- TOC entry 3579 (class 1259 OID 560337)
-- Name: idx_encounter_nodes_manual_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encounter_nodes_manual_branch ON public.encounter_nodes USING btree (patient_id, is_manual_branch) WHERE (is_manual_branch = true);


--
-- TOC entry 3580 (class 1259 OID 560338)
-- Name: idx_encounter_nodes_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encounter_nodes_priority ON public.encounter_nodes USING btree (patient_id, priority) WHERE (is_deleted = false);


--
-- TOC entry 3608 (class 1259 OID 560339)
-- Name: idx_idxcmbtoknu_hashc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idxcmbtoknu_hashc ON public.hfj_idx_cmb_tok_nu USING btree (hash_complete, res_id, partition_id);


--
-- TOC entry 3609 (class 1259 OID 560340)
-- Name: idx_idxcmbtoknu_res; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idxcmbtoknu_res ON public.hfj_idx_cmb_tok_nu USING btree (res_id);


--
-- TOC entry 3610 (class 1259 OID 560341)
-- Name: idx_idxcmbtoknu_str; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idxcmbtoknu_str ON public.hfj_idx_cmb_tok_nu USING btree (idx_string);


--
-- TOC entry 3613 (class 1259 OID 560342)
-- Name: idx_idxcmpstruniq_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idxcmpstruniq_resource ON public.hfj_idx_cmp_string_uniq USING btree (res_id);


--
-- TOC entry 3750 (class 1259 OID 560343)
-- Name: idx_node_relations_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_node_relations_deleted ON public.node_relations USING btree (is_deleted, source_node_id, target_node_id) WHERE (is_deleted = false);


--
-- TOC entry 3751 (class 1259 OID 560344)
-- Name: idx_node_relations_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_node_relations_source ON public.node_relations USING btree (source_node_id) WHERE (is_deleted = false);


--
-- TOC entry 3752 (class 1259 OID 560345)
-- Name: idx_node_relations_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_node_relations_target ON public.node_relations USING btree (target_node_id) WHERE (is_deleted = false);


--
-- TOC entry 3767 (class 1259 OID 560346)
-- Name: idx_packverres_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_packverres_url ON public.npm_package_ver_res USING btree (canonical_url);


--
-- TOC entry 3655 (class 1259 OID 560347)
-- Name: idx_res_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_res_date ON public.hfj_resource USING btree (res_updated);


--
-- TOC entry 3656 (class 1259 OID 560348)
-- Name: idx_res_fhir_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_res_fhir_id ON public.hfj_resource USING btree (fhir_id);


--
-- TOC entry 3657 (class 1259 OID 560349)
-- Name: idx_res_resid_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_res_resid_updated ON public.hfj_resource USING btree (res_id, res_updated, partition_id);


--
-- TOC entry 3636 (class 1259 OID 560350)
-- Name: idx_res_tag_res_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_res_tag_res_tag ON public.hfj_res_tag USING btree (res_id, tag_id, partition_id);


--
-- TOC entry 3637 (class 1259 OID 560351)
-- Name: idx_res_tag_tag_res; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_res_tag_tag_res ON public.hfj_res_tag USING btree (tag_id, res_id, partition_id);


--
-- TOC entry 3658 (class 1259 OID 560352)
-- Name: idx_res_type_del_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_res_type_del_updated ON public.hfj_resource USING btree (res_type, res_deleted_at, res_updated, partition_id, res_id);


--
-- TOC entry 3603 (class 1259 OID 560353)
-- Name: idx_reshisttag_resid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reshisttag_resid ON public.hfj_history_tag USING btree (res_id);


--
-- TOC entry 3626 (class 1259 OID 560354)
-- Name: idx_resparmpresent_hashpres; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resparmpresent_hashpres ON public.hfj_res_param_present USING btree (hash_presence);


--
-- TOC entry 3627 (class 1259 OID 560355)
-- Name: idx_resparmpresent_resid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resparmpresent_resid ON public.hfj_res_param_present USING btree (res_id);


--
-- TOC entry 3632 (class 1259 OID 560356)
-- Name: idx_ressearchurl_res; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ressearchurl_res ON public.hfj_res_search_url USING btree (res_id);


--
-- TOC entry 3633 (class 1259 OID 560357)
-- Name: idx_ressearchurl_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ressearchurl_time ON public.hfj_res_search_url USING btree (created_time);


--
-- TOC entry 3642 (class 1259 OID 560358)
-- Name: idx_resver_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resver_date ON public.hfj_res_ver USING btree (res_updated, res_id);


--
-- TOC entry 3643 (class 1259 OID 560359)
-- Name: idx_resver_id_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resver_id_date ON public.hfj_res_ver USING btree (res_id, res_updated);


--
-- TOC entry 3644 (class 1259 OID 560360)
-- Name: idx_resver_id_src_uri; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resver_id_src_uri ON public.hfj_res_ver USING btree (source_uri, res_id, partition_id);


--
-- TOC entry 3647 (class 1259 OID 560361)
-- Name: idx_resver_type_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resver_type_date ON public.hfj_res_ver USING btree (res_type, res_updated, res_id);


--
-- TOC entry 3650 (class 1259 OID 560362)
-- Name: idx_resverprov_requestid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resverprov_requestid ON public.hfj_res_ver_prov USING btree (request_id);


--
-- TOC entry 3651 (class 1259 OID 560363)
-- Name: idx_resverprov_res_pid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resverprov_res_pid ON public.hfj_res_ver_prov USING btree (res_pid);


--
-- TOC entry 3652 (class 1259 OID 560364)
-- Name: idx_resverprov_sourceuri; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resverprov_sourceuri ON public.hfj_res_ver_prov USING btree (source_uri);


--
-- TOC entry 3622 (class 1259 OID 560365)
-- Name: idx_rl_src; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rl_src ON public.hfj_res_link USING btree (src_resource_id);


--
-- TOC entry 3623 (class 1259 OID 560366)
-- Name: idx_rl_tgt_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rl_tgt_v2 ON public.hfj_res_link USING btree (target_resource_id, src_path, src_resource_id, target_resource_type, partition_id);


--
-- TOC entry 3671 (class 1259 OID 560367)
-- Name: idx_search_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_created ON public.hfj_search USING btree (created);


--
-- TOC entry 3672 (class 1259 OID 560368)
-- Name: idx_search_restype_hashs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_restype_hashs ON public.hfj_search USING btree (resource_type, search_query_string_hash, created);


--
-- TOC entry 3684 (class 1259 OID 560369)
-- Name: idx_sp_coords_hash_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_coords_hash_v2 ON public.hfj_spidx_coords USING btree (hash_identity, sp_latitude, sp_longitude, res_id, partition_id);


--
-- TOC entry 3685 (class 1259 OID 560370)
-- Name: idx_sp_coords_resid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_coords_resid ON public.hfj_spidx_coords USING btree (res_id);


--
-- TOC entry 3686 (class 1259 OID 560371)
-- Name: idx_sp_coords_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_coords_updated ON public.hfj_spidx_coords USING btree (sp_updated);


--
-- TOC entry 3689 (class 1259 OID 560372)
-- Name: idx_sp_date_hash_high_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_date_hash_high_v2 ON public.hfj_spidx_date USING btree (hash_identity, sp_value_high, res_id, partition_id);


--
-- TOC entry 3690 (class 1259 OID 560373)
-- Name: idx_sp_date_hash_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_date_hash_v2 ON public.hfj_spidx_date USING btree (hash_identity, sp_value_low, sp_value_high, res_id, partition_id);


--
-- TOC entry 3691 (class 1259 OID 560374)
-- Name: idx_sp_date_ord_hash_high_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_date_ord_hash_high_v2 ON public.hfj_spidx_date USING btree (hash_identity, sp_value_high_date_ordinal, res_id, partition_id);


--
-- TOC entry 3692 (class 1259 OID 560375)
-- Name: idx_sp_date_ord_hash_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_date_ord_hash_v2 ON public.hfj_spidx_date USING btree (hash_identity, sp_value_low_date_ordinal, sp_value_high_date_ordinal, res_id, partition_id);


--
-- TOC entry 3693 (class 1259 OID 560376)
-- Name: idx_sp_date_resid_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_date_resid_v2 ON public.hfj_spidx_date USING btree (res_id, hash_identity, sp_value_low, sp_value_high, sp_value_low_date_ordinal, sp_value_high_date_ordinal, partition_id);


--
-- TOC entry 3700 (class 1259 OID 560377)
-- Name: idx_sp_number_hash_val_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_number_hash_val_v2 ON public.hfj_spidx_number USING btree (hash_identity, sp_value, res_id, partition_id);


--
-- TOC entry 3701 (class 1259 OID 560378)
-- Name: idx_sp_number_resid_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_number_resid_v2 ON public.hfj_spidx_number USING btree (res_id, hash_identity, sp_value, partition_id);


--
-- TOC entry 3710 (class 1259 OID 560379)
-- Name: idx_sp_qnty_nrml_hash_sysun_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_qnty_nrml_hash_sysun_v2 ON public.hfj_spidx_quantity_nrml USING btree (hash_identity_sys_units, sp_value, res_id, partition_id);


--
-- TOC entry 3711 (class 1259 OID 560380)
-- Name: idx_sp_qnty_nrml_hash_un_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_qnty_nrml_hash_un_v2 ON public.hfj_spidx_quantity_nrml USING btree (hash_identity_and_units, sp_value, res_id, partition_id);


--
-- TOC entry 3712 (class 1259 OID 560381)
-- Name: idx_sp_qnty_nrml_hash_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_qnty_nrml_hash_v2 ON public.hfj_spidx_quantity_nrml USING btree (hash_identity, sp_value, res_id, partition_id);


--
-- TOC entry 3713 (class 1259 OID 560382)
-- Name: idx_sp_qnty_nrml_resid_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_qnty_nrml_resid_v2 ON public.hfj_spidx_quantity_nrml USING btree (res_id, hash_identity, hash_identity_sys_units, hash_identity_and_units, sp_value, partition_id);


--
-- TOC entry 3704 (class 1259 OID 560383)
-- Name: idx_sp_quantity_hash_sysun_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_quantity_hash_sysun_v2 ON public.hfj_spidx_quantity USING btree (hash_identity_sys_units, sp_value, res_id, partition_id);


--
-- TOC entry 3705 (class 1259 OID 560384)
-- Name: idx_sp_quantity_hash_un_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_quantity_hash_un_v2 ON public.hfj_spidx_quantity USING btree (hash_identity_and_units, sp_value, res_id, partition_id);


--
-- TOC entry 3706 (class 1259 OID 560385)
-- Name: idx_sp_quantity_hash_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_quantity_hash_v2 ON public.hfj_spidx_quantity USING btree (hash_identity, sp_value, res_id, partition_id);


--
-- TOC entry 3707 (class 1259 OID 560386)
-- Name: idx_sp_quantity_resid_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_quantity_resid_v2 ON public.hfj_spidx_quantity USING btree (res_id, hash_identity, hash_identity_sys_units, hash_identity_and_units, sp_value, partition_id);


--
-- TOC entry 3716 (class 1259 OID 560387)
-- Name: idx_sp_string_hash_exct_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_string_hash_exct_v2 ON public.hfj_spidx_string USING btree (hash_exact, res_id, partition_id);


--
-- TOC entry 3717 (class 1259 OID 560388)
-- Name: idx_sp_string_hash_ident_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_string_hash_ident_v2 ON public.hfj_spidx_string USING btree (hash_identity, res_id, partition_id);


--
-- TOC entry 3718 (class 1259 OID 560389)
-- Name: idx_sp_string_hash_nrm_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_string_hash_nrm_v2 ON public.hfj_spidx_string USING btree (hash_norm_prefix, sp_value_normalized, res_id, partition_id);


--
-- TOC entry 3719 (class 1259 OID 560390)
-- Name: idx_sp_string_resid_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_string_resid_v2 ON public.hfj_spidx_string USING btree (res_id, hash_norm_prefix, partition_id);


--
-- TOC entry 3722 (class 1259 OID 560391)
-- Name: idx_sp_token_hash_s_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_token_hash_s_v2 ON public.hfj_spidx_token USING btree (hash_sys, res_id, partition_id);


--
-- TOC entry 3723 (class 1259 OID 560392)
-- Name: idx_sp_token_hash_sv_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_token_hash_sv_v2 ON public.hfj_spidx_token USING btree (hash_sys_and_value, res_id, partition_id);


--
-- TOC entry 3724 (class 1259 OID 560393)
-- Name: idx_sp_token_hash_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_token_hash_v2 ON public.hfj_spidx_token USING btree (hash_identity, sp_system, sp_value, res_id, partition_id);


--
-- TOC entry 3725 (class 1259 OID 560394)
-- Name: idx_sp_token_hash_v_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_token_hash_v_v2 ON public.hfj_spidx_token USING btree (hash_value, res_id, partition_id);


--
-- TOC entry 3726 (class 1259 OID 560395)
-- Name: idx_sp_token_resid_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_token_resid_v2 ON public.hfj_spidx_token USING btree (res_id, hash_sys_and_value, hash_value, hash_sys, hash_identity, partition_id);


--
-- TOC entry 3729 (class 1259 OID 560396)
-- Name: idx_sp_uri_coords; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_uri_coords ON public.hfj_spidx_uri USING btree (res_id);


--
-- TOC entry 3730 (class 1259 OID 560397)
-- Name: idx_sp_uri_hash_identity_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_uri_hash_identity_v2 ON public.hfj_spidx_uri USING btree (hash_identity, sp_uri, res_id, partition_id);


--
-- TOC entry 3731 (class 1259 OID 560398)
-- Name: idx_sp_uri_hash_uri_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_uri_hash_uri_v2 ON public.hfj_spidx_uri USING btree (hash_uri, res_id, partition_id);


--
-- TOC entry 3738 (class 1259 OID 560399)
-- Name: idx_tag_def_tp_cd_sys; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tag_def_tp_cd_sys ON public.hfj_tag_def USING btree (tag_type, tag_code, tag_system, tag_id, tag_version, tag_user_selected);


--
-- TOC entry 3886 (class 2620 OID 560400)
-- Name: encounter_nodes trg_encounter_nodes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_encounter_nodes_updated_at BEFORE UPDATE ON public.encounter_nodes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 3887 (class 2620 OID 560401)
-- Name: encounter_nodes trigger_encounter_nodes_update_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_encounter_nodes_update_timestamp BEFORE UPDATE ON public.encounter_nodes FOR EACH ROW EXECUTE FUNCTION public.update_encounter_nodes_timestamp();


--
-- TOC entry 3836 (class 2606 OID 560402)
-- Name: hfj_blk_export_collection fk_blkexcol_job; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_blk_export_collection
    ADD CONSTRAINT fk_blkexcol_job FOREIGN KEY (job_pid) REFERENCES public.hfj_blk_export_job(pid);


--
-- TOC entry 3835 (class 2606 OID 560407)
-- Name: hfj_blk_export_colfile fk_blkexcolfile_collect; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_blk_export_colfile
    ADD CONSTRAINT fk_blkexcolfile_collect FOREIGN KEY (collection_pid) REFERENCES public.hfj_blk_export_collection(pid);


--
-- TOC entry 3837 (class 2606 OID 560412)
-- Name: hfj_blk_import_jobfile fk_blkimjobfile_job; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_blk_import_jobfile
    ADD CONSTRAINT fk_blkimjobfile_job FOREIGN KEY (job_pid) REFERENCES public.hfj_blk_import_job(pid);


--
-- TOC entry 3833 (class 2606 OID 560417)
-- Name: encounter_nodes fk_branch_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encounter_nodes
    ADD CONSTRAINT fk_branch_id FOREIGN KEY (branch_id) REFERENCES public.encounter_nodes(encounter_fhir_id) ON DELETE SET NULL;


--
-- TOC entry 3832 (class 2606 OID 560422)
-- Name: bt2_work_chunk fk_bt2wc_instance; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bt2_work_chunk
    ADD CONSTRAINT fk_bt2wc_instance FOREIGN KEY (instance_id) REFERENCES public.bt2_job_instance(id);


--
-- TOC entry 3868 (class 2606 OID 560427)
-- Name: trm_codesystem_ver fk_codesysver_cs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_codesystem_ver
    ADD CONSTRAINT fk_codesysver_cs_id FOREIGN KEY (codesystem_pid) REFERENCES public.trm_codesystem(pid);


--
-- TOC entry 3869 (class 2606 OID 560432)
-- Name: trm_codesystem_ver fk_codesysver_res_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_codesystem_ver
    ADD CONSTRAINT fk_codesysver_res_id FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3870 (class 2606 OID 560437)
-- Name: trm_concept fk_concept_pid_cs_pid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept
    ADD CONSTRAINT fk_concept_pid_cs_pid FOREIGN KEY (codesystem_pid) REFERENCES public.trm_codesystem_ver(pid);


--
-- TOC entry 3871 (class 2606 OID 560442)
-- Name: trm_concept_desig fk_conceptdesig_concept; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_desig
    ADD CONSTRAINT fk_conceptdesig_concept FOREIGN KEY (concept_pid) REFERENCES public.trm_concept(pid);


--
-- TOC entry 3872 (class 2606 OID 560447)
-- Name: trm_concept_desig fk_conceptdesig_csv; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_desig
    ADD CONSTRAINT fk_conceptdesig_csv FOREIGN KEY (cs_ver_pid) REFERENCES public.trm_codesystem_ver(pid);


--
-- TOC entry 3880 (class 2606 OID 560452)
-- Name: trm_concept_property fk_conceptprop_concept; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_property
    ADD CONSTRAINT fk_conceptprop_concept FOREIGN KEY (concept_pid) REFERENCES public.trm_concept(pid);


--
-- TOC entry 3881 (class 2606 OID 560457)
-- Name: trm_concept_property fk_conceptprop_csv; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_property
    ADD CONSTRAINT fk_conceptprop_csv FOREIGN KEY (cs_ver_pid) REFERENCES public.trm_codesystem_ver(pid);


--
-- TOC entry 3856 (class 2606 OID 560462)
-- Name: mpi_link fk_empi_link_golden_resource; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpi_link
    ADD CONSTRAINT fk_empi_link_golden_resource FOREIGN KEY (golden_resource_pid) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3857 (class 2606 OID 560467)
-- Name: mpi_link fk_empi_link_person; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpi_link
    ADD CONSTRAINT fk_empi_link_person FOREIGN KEY (person_pid) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3858 (class 2606 OID 560472)
-- Name: mpi_link fk_empi_link_target; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpi_link
    ADD CONSTRAINT fk_empi_link_target FOREIGN KEY (target_pid) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3834 (class 2606 OID 560477)
-- Name: encounter_nodes fk_encounter_nodes_to_resource; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encounter_nodes
    ADD CONSTRAINT fk_encounter_nodes_to_resource FOREIGN KEY (res_type, encounter_fhir_id) REFERENCES public.hfj_resource(res_type, fhir_id) ON DELETE CASCADE;


--
-- TOC entry 3838 (class 2606 OID 560482)
-- Name: hfj_history_tag fk_historytag_history; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_history_tag
    ADD CONSTRAINT fk_historytag_history FOREIGN KEY (res_ver_pid) REFERENCES public.hfj_res_ver(pid);


--
-- TOC entry 3839 (class 2606 OID 560487)
-- Name: hfj_idx_cmb_tok_nu fk_idxcmbtoknu_res_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_idx_cmb_tok_nu
    ADD CONSTRAINT fk_idxcmbtoknu_res_id FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3840 (class 2606 OID 560492)
-- Name: hfj_idx_cmp_string_uniq fk_idxcmpstruniq_res_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_idx_cmp_string_uniq
    ADD CONSTRAINT fk_idxcmpstruniq_res_id FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3860 (class 2606 OID 560497)
-- Name: node_relations fk_node_relations_source; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_relations
    ADD CONSTRAINT fk_node_relations_source FOREIGN KEY (source_node_id) REFERENCES public.encounter_nodes(encounter_fhir_id) ON DELETE CASCADE;


--
-- TOC entry 3861 (class 2606 OID 560502)
-- Name: node_relations fk_node_relations_target; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_relations
    ADD CONSTRAINT fk_node_relations_target FOREIGN KEY (target_node_id) REFERENCES public.encounter_nodes(encounter_fhir_id) ON DELETE CASCADE;


--
-- TOC entry 3864 (class 2606 OID 560507)
-- Name: npm_package_ver_res fk_npm_packverres_packver; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npm_package_ver_res
    ADD CONSTRAINT fk_npm_packverres_packver FOREIGN KEY (packver_pid) REFERENCES public.npm_package_ver(pid);


--
-- TOC entry 3862 (class 2606 OID 560512)
-- Name: npm_package_ver fk_npm_pkv_pkg; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npm_package_ver
    ADD CONSTRAINT fk_npm_pkv_pkg FOREIGN KEY (package_pid) REFERENCES public.npm_package(pid);


--
-- TOC entry 3863 (class 2606 OID 560517)
-- Name: npm_package_ver fk_npm_pkv_resid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npm_package_ver
    ADD CONSTRAINT fk_npm_pkv_resid FOREIGN KEY (binary_res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3865 (class 2606 OID 560522)
-- Name: npm_package_ver_res fk_npm_pkvr_resid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npm_package_ver_res
    ADD CONSTRAINT fk_npm_pkvr_resid FOREIGN KEY (binary_res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3841 (class 2606 OID 560527)
-- Name: hfj_res_link fk_reslink_source; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_link
    ADD CONSTRAINT fk_reslink_source FOREIGN KEY (src_resource_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3842 (class 2606 OID 560532)
-- Name: hfj_res_link fk_reslink_target; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_link
    ADD CONSTRAINT fk_reslink_target FOREIGN KEY (target_resource_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3845 (class 2606 OID 560537)
-- Name: hfj_res_ver fk_resource_history_resource; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_ver
    ADD CONSTRAINT fk_resource_history_resource FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3843 (class 2606 OID 560542)
-- Name: hfj_res_param_present fk_resparmpres_resid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_param_present
    ADD CONSTRAINT fk_resparmpres_resid FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3844 (class 2606 OID 560547)
-- Name: hfj_res_tag fk_restag_resource; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_tag
    ADD CONSTRAINT fk_restag_resource FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3846 (class 2606 OID 560552)
-- Name: hfj_res_ver_prov fk_resverprov_res_pid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_res_ver_prov
    ADD CONSTRAINT fk_resverprov_res_pid FOREIGN KEY (res_pid) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3847 (class 2606 OID 560557)
-- Name: hfj_search_include fk_searchinc_search; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_search_include
    ADD CONSTRAINT fk_searchinc_search FOREIGN KEY (search_pid) REFERENCES public.hfj_search(pid);


--
-- TOC entry 3849 (class 2606 OID 560562)
-- Name: hfj_spidx_date fk_sp_date_res; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_date
    ADD CONSTRAINT fk_sp_date_res FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3850 (class 2606 OID 560567)
-- Name: hfj_spidx_number fk_sp_number_res; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_number
    ADD CONSTRAINT fk_sp_number_res FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3851 (class 2606 OID 560572)
-- Name: hfj_spidx_quantity fk_sp_quantity_res; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_quantity
    ADD CONSTRAINT fk_sp_quantity_res FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3852 (class 2606 OID 560577)
-- Name: hfj_spidx_quantity_nrml fk_sp_quantitynm_res; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_quantity_nrml
    ADD CONSTRAINT fk_sp_quantitynm_res FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3854 (class 2606 OID 560582)
-- Name: hfj_spidx_token fk_sp_token_res; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_token
    ADD CONSTRAINT fk_sp_token_res FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3853 (class 2606 OID 560587)
-- Name: hfj_spidx_string fk_spidxstr_resource; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_string
    ADD CONSTRAINT fk_spidxstr_resource FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3875 (class 2606 OID 560592)
-- Name: trm_concept_map_grp_element fk_tcmgelement_group; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_map_grp_element
    ADD CONSTRAINT fk_tcmgelement_group FOREIGN KEY (concept_map_group_pid) REFERENCES public.trm_concept_map_group(pid);


--
-- TOC entry 3876 (class 2606 OID 560597)
-- Name: trm_concept_map_grp_elm_tgt fk_tcmgetarget_element; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_map_grp_elm_tgt
    ADD CONSTRAINT fk_tcmgetarget_element FOREIGN KEY (concept_map_grp_elm_pid) REFERENCES public.trm_concept_map_grp_element(pid);


--
-- TOC entry 3874 (class 2606 OID 560602)
-- Name: trm_concept_map_group fk_tcmgroup_conceptmap; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_map_group
    ADD CONSTRAINT fk_tcmgroup_conceptmap FOREIGN KEY (concept_map_pid) REFERENCES public.trm_concept_map(pid);


--
-- TOC entry 3877 (class 2606 OID 560607)
-- Name: trm_concept_pc_link fk_term_conceptpc_child; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_pc_link
    ADD CONSTRAINT fk_term_conceptpc_child FOREIGN KEY (child_pid) REFERENCES public.trm_concept(pid);


--
-- TOC entry 3878 (class 2606 OID 560612)
-- Name: trm_concept_pc_link fk_term_conceptpc_cs; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_pc_link
    ADD CONSTRAINT fk_term_conceptpc_cs FOREIGN KEY (codesystem_pid) REFERENCES public.trm_codesystem_ver(pid);


--
-- TOC entry 3879 (class 2606 OID 560617)
-- Name: trm_concept_pc_link fk_term_conceptpc_parent; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_pc_link
    ADD CONSTRAINT fk_term_conceptpc_parent FOREIGN KEY (parent_pid) REFERENCES public.trm_concept(pid);


--
-- TOC entry 3883 (class 2606 OID 560622)
-- Name: trm_valueset_c_designation fk_trm_valueset_concept_pid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_valueset_c_designation
    ADD CONSTRAINT fk_trm_valueset_concept_pid FOREIGN KEY (valueset_concept_pid) REFERENCES public.trm_valueset_concept(pid);


--
-- TOC entry 3885 (class 2606 OID 560627)
-- Name: trm_valueset_concept fk_trm_valueset_pid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_valueset_concept
    ADD CONSTRAINT fk_trm_valueset_pid FOREIGN KEY (valueset_pid) REFERENCES public.trm_valueset(pid);


--
-- TOC entry 3884 (class 2606 OID 560632)
-- Name: trm_valueset_c_designation fk_trm_vscd_vs_pid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_valueset_c_designation
    ADD CONSTRAINT fk_trm_vscd_vs_pid FOREIGN KEY (valueset_pid) REFERENCES public.trm_valueset(pid);


--
-- TOC entry 3866 (class 2606 OID 560637)
-- Name: trm_codesystem fk_trmcodesystem_curver; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_codesystem
    ADD CONSTRAINT fk_trmcodesystem_curver FOREIGN KEY (current_version_pid) REFERENCES public.trm_codesystem_ver(pid);


--
-- TOC entry 3867 (class 2606 OID 560642)
-- Name: trm_codesystem fk_trmcodesystem_res; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_codesystem
    ADD CONSTRAINT fk_trmcodesystem_res FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3873 (class 2606 OID 560647)
-- Name: trm_concept_map fk_trmconceptmap_res; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_concept_map
    ADD CONSTRAINT fk_trmconceptmap_res FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3882 (class 2606 OID 560652)
-- Name: trm_valueset fk_trmvalueset_res; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trm_valueset
    ADD CONSTRAINT fk_trmvalueset_res FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3848 (class 2606 OID 560657)
-- Name: hfj_spidx_coords fkc97mpk37okwu8qvtceg2nh9vn; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_coords
    ADD CONSTRAINT fkc97mpk37okwu8qvtceg2nh9vn FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3855 (class 2606 OID 560662)
-- Name: hfj_spidx_uri fkgxsreutymmfjuwdswv3y887do; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hfj_spidx_uri
    ADD CONSTRAINT fkgxsreutymmfjuwdswv3y887do FOREIGN KEY (res_id) REFERENCES public.hfj_resource(res_id);


--
-- TOC entry 3859 (class 2606 OID 560667)
-- Name: mpi_link_aud fkkbqi6ie5cmr64rl4a1qbeury1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpi_link_aud
    ADD CONSTRAINT fkkbqi6ie5cmr64rl4a1qbeury1 FOREIGN KEY (rev) REFERENCES public.hfj_revinfo(rev);


-- Completed on 2026-07-02 00:00:10

--
-- PostgreSQL database dump complete
--

\unrestrict V7n9VjYKlcXOeZu6FNl8XVrktXFOqOfPTkxdRUFhEHMlResZMejXV1fppACZUXw

