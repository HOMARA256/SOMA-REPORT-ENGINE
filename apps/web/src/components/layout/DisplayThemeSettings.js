import { Contrast, Monitor, Moon, Sun } from "lucide-react";
import { setDisplayTheme, useDisplayTheme } from "../../config/displayTheme";
const options = [
    { value: "light", label: "Light", description: "The familiar SOMA navy and blue appearance.", icon: Sun },
    { value: "dark", label: "Dark", description: "Darker surfaces with readable controls and content.", icon: Moon },
    { value: "system", label: "System default", description: "Follow this device’s light or dark setting.", icon: Monitor },
    { value: "high-contrast", label: "High contrast", description: "Stronger text, borders, and focus indicators.", icon: Contrast },
];
export function DisplayThemeSettings() {
    const theme = useDisplayTheme();
    return <section className="panel display-theme-settings" aria-labelledby="display-theme-title">
    <div className="panel-heading"><div><h2 id="display-theme-title">Display theme</h2><p>Choose how SOMA REPORT ENGINE appears on this device. Printed documents keep their approved layout.</p></div></div>
    <div className="display-theme-options" role="group" aria-label="Display theme">
      {options.map(({ value, label, description, icon: Icon }) => <button type="button" key={value} className="display-theme-option" aria-pressed={theme === value} onClick={() => setDisplayTheme(value)}>
        <Icon size={21} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span>
      </button>)}
    </div>
    <p className="display-theme-note">This preference is saved in this browser. It does not change your school’s branding or anyone else’s display.</p>
  </section>;
}
