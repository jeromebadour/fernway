// Jerome Badour, who built and runs Fernway: one card for every page that credits him, so his photo and links change in
// one place. Fernway exists as proof of his work (GHL-BUILD.md §1): the card always links to his own site.
import Image from "next/image";
import { GOut } from "./glyphs";

export const JEROME = {
  name: "Jerome Badour",
  site: "https://jeromebadour.com",
  github: "https://github.com/jeromebadour",
  photo: "/jerome-badour.webp" as string | null,
};

export function BuilderCard({ className = "", large = false }: { className?: string; large?: boolean }) {
  const px = large ? 76 : 48;
  return (
    <a className={`wb-consignee bd-card${large ? " bd-large" : ""} ${className}`} href={JEROME.site}>
      {JEROME.photo ? <Image className="bd-photo" src={JEROME.photo} alt="" width={px} height={px} unoptimized /> : <span className="wb-ava">JB</span>}
      <span className="bd-who">
        <span className="wb-name">{JEROME.name} <span className="wb-role">Developer</span></span>
        <span className="wb-org">Independent, full-stack: web apps, APIs, servers and integrations</span>
      </span>
      <span className="bd-go"><GOut size={15} />jeromebadour.com</span>
    </a>
  );
}
