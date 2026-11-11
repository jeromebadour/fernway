import type { ShipmentState } from "@fernway/delivery";
import { GCheck, GHold, GResend, GRoute } from "@/ui/glyphs";

// A lead's state in a word, a colour and a glyph: the same words as its receipt.
export function stateWord(state: ShipmentState, tries: number) {
  switch (state) {
    case "signed": return { word: "Signed for", tone: "ok", G: GCheck };
    case "held": return { word: "Held", tone: "hz", G: GHold };
    case "returned": return { word: "Returned", tone: "hz", G: GHold };
    case "waiting": return { word: `Retry ${tries + 1} of 8 booked`, tone: "re", G: GResend };
    default: return { word: "In transit", tone: "in", G: GRoute };
  }
}
