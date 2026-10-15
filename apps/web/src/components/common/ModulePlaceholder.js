import { ArrowRight, Construction, } from "lucide-react";
export default function ModulePlaceholder({ eyebrow = "SOMA REPORT ENGINE", title, description, }) {
    return (<section className="placeholder-page">
      <div className="placeholder-icon">
        <Construction size={25}/>
      </div>

      <span className="eyebrow">
        {eyebrow}
      </span>

      <h1>{title}</h1>

      <p>{description}</p>

      <span className="text-button">
        Module implementation scheduled
        <ArrowRight size={15}/>
      </span>
    </section>);
}
