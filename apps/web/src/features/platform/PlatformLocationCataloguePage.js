import { AlertTriangle, Database, MapPin, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { platformSupabase as supabase } from "../../config/supabaseClient";
export function PlatformLocationCataloguePage() {
    const [locations, setLocations] = useState([]);
    const [coverage, setCoverage] = useState([]);
    const [query, setQuery] = useState("");
    const [level, setLevel] = useState("ALL");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => { let active = true; (async () => { if (!supabase) {
        setError("Supabase is not configured.");
        setLoading(false);
        return;
    } const client = supabase; const [locationResult, coverageResult] = await Promise.all([client.from("uganda_locations").select("id,name,code,level,parent_id,status,is_verified,branch_complete,source_reference").order("name"), client.from("uganda_location_catalogue_coverage").select("region,districts,cities,counties,city_divisions,lower_local_governments,parishes_wards,villages_zones,incomplete_branches").order("region")]); if (!active)
        return; if (locationResult.error || coverageResult.error)
        setError(locationResult.error?.message ?? coverageResult.error?.message ?? "Catalogue could not be loaded.");
    else {
        setLocations((locationResult.data ?? []));
        setCoverage((coverageResult.data ?? []));
    } setLoading(false); })(); return () => { active = false; }; }, []);
    const levels = useMemo(() => Array.from(new Set(locations.map((item) => item.level))).sort(), [locations]);
    const filtered = locations.filter((item) => (level === "ALL" || item.level === level) && `${item.name} ${item.code}`.toLowerCase().includes(query.toLowerCase()));
    return <><section className="platform-page-heading"><div><span className="eyebrow">PROTECTED NATIONAL REFERENCE DATA</span><h1>Uganda Location Catalogue</h1><p>Verified administrative units from region through subcounty, used by registration, school addresses, reporting, billing and platform analytics.</p></div></section>
    <section className="panel platform-catalogue-governance"><ShieldCheck size={20}/><div><strong>Platform-owned catalogue</strong><p>Schools may select these records but cannot create, rename, delete or restructure them. The approved registration hierarchy ends at subcounty.</p></div></section>
    <section className="location-coverage-grid">{coverage.map((row) => <article className="panel" key={row.region}><MapPin size={20}/><div><strong>{row.region}</strong><span>{row.districts} districts · {row.counties} counties</span><small>{row.lower_local_governments} subcounties</small></div></article>)}</section>
    <section className="panel platform-catalogue-panel"><div className="location-catalogue-toolbar"><label><span>Search catalogue</span><div><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or code"/></div></label><label><span>Administrative type</span><select value={level} onChange={(event) => setLevel(event.target.value)}><option value="ALL">All types</option>{levels.map((item) => <option key={item}>{item.replaceAll("_", " ")}</option>)}</select></label></div>
      {loading ? <div className="platform-catalogue-empty"><Database size={24}/> Loading protected catalogue…</div> : error ? <div className="form-error-message registration-feedback" role="alert"><AlertTriangle size={18}/>{error}</div> : <div className="table-wrapper"><table className="data-table location-catalogue-table"><thead><tr><th>Location</th><th>Code</th><th>Type</th><th>Verified</th><th>Branch</th><th>Source</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.code}</td><td>{item.level.replaceAll("_", " ")}</td><td><span className={`platform-badge ${item.is_verified ? "success" : "warning"}`}>{item.is_verified ? "VERIFIED" : "PENDING"}</span></td><td>{item.branch_complete ? "Complete" : "Needs verified children"}</td><td>{item.source_reference ?? "Not recorded"}</td></tr>)}</tbody></table></div>}<footer>{filtered.length} of {locations.length} catalogue records</footer></section>
  </>;
}
