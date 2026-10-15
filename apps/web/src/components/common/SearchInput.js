import { Search, X } from "lucide-react";
export function SearchInput({ value, onChange, placeholder = "Search...", }) {
    return (<div className="search-input">
      <Search size={17} aria-hidden="true"/>

      <input type="search" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)}/>

      {value && (<button type="button" onClick={() => onChange("")} aria-label="Clear search">
          <X size={15}/>
        </button>)}
    </div>);
}
