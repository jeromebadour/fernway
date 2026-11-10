/**
 * Fernway's Privacy Policy and Terms of Use, as data: each page and its "On this page" list come from the same
 * sections. Text marks: **bold** and [label](/path) links. Every sentence describes what Fernway really does, checked
 * against the code (packages/delivery, apps/web) and the box (backups, logs); change the text when the code changes.
 */
export type LegalSection = { id: string; title: string; clauses: string[] };
export type LegalDoc = { title: string; intro: string; version: string; effective: string; short: string[]; sections: LegalSection[] };

export const CONTACT_EMAIL = "privacy@jeromebadour.com";

export const privacy: LegalDoc = {
  title: "Privacy Policy",
  intro: "What Fernway keeps when you send one of its forms, where it goes, how long it stays and how to have it removed sooner.",
  version: "1.0",
  effective: "10 November 2026",
  short: [
    "What you type in a form goes into Fernway's demo GoHighLevel account, and stays 30 days.",
    "Then it is removed from GoHighLevel first, and from Fernway after.",
    "No cookies on the public site, no analytics, no ads, nothing sold.",
  ],
  sections: [
    {
      id: "scope",
      title: "Scope",
      clauses: [
        "This policy covers the public site at fernway.jeromebadour.com: its forms (Start a trial, Contact sales, Book a demo), the tracking receipts they give you, and Track a lead.",
        "Fernway is a **portfolio product**: a working GoHighLevel integration built to show how one is made. It has no customers. It is run by **Jerome Badour, an individual**, who decides what is collected and why. Contact: [privacy@jeromebadour.com](mailto:privacy@jeromebadour.com).",
        "It sits alongside the [Terms of Use](/terms).",
      ],
    },
    {
      id: "what-we-keep",
      title: "What we keep",
      clauses: [
        "**What you type in a form:** your name, email address, and, where the form asks for them, your phone number, company, website, message and the meeting time you picked. Only the fields you fill in are kept.",
        "**Your lead's waybill:** its number, when it was picked up, and every step it took on its way into GoHighLevel (the scans), each with the time and what GoHighLevel answered.",
        "That is all. We do not keep your IP address with your lead, and we do not look up where you are.",
      ],
    },
    {
      id: "where-it-goes",
      title: "Where it goes",
      clauses: [
        "This is what the forms are for: your lead is delivered into **Fernway's own demo account at GoHighLevel** (a test account GoHighLevel provides to developers), the same way Fernway would deliver a customer's leads. It becomes a contact there; a message becomes a note on it; a booked demo becomes an appointment on its calendar; and it is placed in a pipeline stage. GoHighLevel (HighLevel, Inc.) holds it under its own privacy terms.",
        "Your **tracking receipt** shows your lead's waybill and scans to whoever has its link, with your email address shortened (like l•••@example.com). Keep the link to yourself. On Track a lead, a receipt opens only with its waybill number and the email it was sent with.",
      ],
    },
    {
      id: "who-else",
      title: "Who else sees it",
      clauses: [
        "**GoHighLevel**, as described above.",
        "**Jerome Badour**, who runs Fernway and its GoHighLevel account, and reads what arrives there.",
        "**The hosting provider** (Contabo), whose server stores Fernway's database. It provides the machine; it does not use the data.",
        "**Cloudflare R2**, which stores the nightly backup copy. The copy is encrypted on our server before it leaves, so Cloudflare holds it without being able to read it.",
        "Nobody else, unless the law requires it. We do not sell data, show ads, or use tracking or analytics tools.",
      ],
    },
    {
      id: "where",
      title: "Where it is held",
      clauses: [
        "Fernway's database runs on one server in **Singapore**. Connections to it are encrypted (HTTPS).",
        "The encrypted backup copy is stored by Cloudflare R2 in **Europe**.",
        "What reaches GoHighLevel is held in GoHighLevel's own systems.",
      ],
    },
    {
      id: "how-long",
      title: "How long it is kept",
      clauses: [
        "**30 days.** Every hour, Fernway removes the leads its forms received more than 30 days earlier: first from GoHighLevel (the appointment, the pipeline entry, the contact or your message on it), then from its own database with every scan. If GoHighLevel can't be reached, the lead waits and is tried again an hour later; it is never forgotten by Fernway while it is still in GoHighLevel.",
        "Your **receipt link** stops working after the same 30 days.",
        "**Backups:** the database is backed up every night, to restore the service if something goes wrong and for nothing else. Copies on the server are kept for **14 days** and the encrypted copy off the server for **30 days**, so a removed lead can remain in a backup for up to 30 more days before it is gone for good.",
        "**Limits on the forms:** to keep the demo from being flooded, the number of forms sent from each IP address is counted for about an hour, then the count is deleted. The count is never stored with your lead.",
        "The web server's own logs, which include IP addresses, are kept for **14 days** for security, then deleted.",
      ],
    },
    {
      id: "sooner",
      title: "Removed sooner",
      clauses: [
        "To have your lead removed before its 30 days are up, write to [privacy@jeromebadour.com](mailto:privacy@jeromebadour.com) from the email address you sent it with, and include its waybill number if you have it. It will be removed from GoHighLevel and from Fernway.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies",
      clauses: [
        "The public site sets **no cookies**. Its fonts are served from our own server, so loading a page tells no one else you visited.",
        "There are no advertising, tracking or third-party cookies.",
      ],
    },
    {
      id: "age",
      title: "Age",
      clauses: ["Fernway's forms are meant for adults, sending details about themselves or the business they work for."],
    },
    {
      id: "changes",
      title: "Changes and contact",
      clauses: [
        "When Fernway gains accounts and payments, this policy will be updated to cover them before they open. A new version and its date appear here before it applies.",
        `Questions, or a request about your data: [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).`,
      ],
    },
  ],
};

export const terms: LegalDoc = {
  title: "Terms of Use",
  intro: "What Fernway is, what sending one of its forms does and doesn't do, and what you agree to by using it.",
  version: "1.0",
  effective: "10 November 2026",
  short: [
    "Fernway is a portfolio product, not a company or a service for sale.",
    "Sending a form shows the delivery working; it doesn't start a contract.",
    "Messages through Contact sales reach Jerome Badour, who answers them.",
  ],
  sections: [
    {
      id: "what-fernway-is",
      title: "What Fernway is",
      clauses: [
        "Fernway is a **portfolio product** built and run by Jerome Badour, an independent developer, to show a working GoHighLevel integration: real forms, a real delivery queue, a real GoHighLevel account. It is not a registered company and is not offered for sale.",
        "Its plans and prices describe how Fernway would be priced as a product. No one can buy it, and no payment is taken.",
      ],
    },
    {
      id: "the-forms",
      title: "The forms",
      clauses: [
        "**Start a trial** and **Book a demo** show the delivery working, end to end, with your own details: your lead goes into Fernway's demo GoHighLevel account and you can watch it arrive. Sending them does not open a trial account or commit anyone to a meeting.",
        "**Contact sales** messages reach Jerome Badour, who reads and answers them.",
        "Send only your own details, or details you are allowed to share. Do not send anything sensitive: passwords, payment details, health or other private information.",
        "The forms take a few sends per visitor an hour, and only so many a day, to keep the demo from being flooded.",
      ],
    },
    {
      id: "fair-use",
      title: "Fair use",
      clauses: [
        "Do not try to break into Fernway, overload it, get around its limits, or reach other people's receipts.",
        "Do not use the forms to send spam, or other people's details without their agreement.",
      ],
    },
    {
      id: "no-promise",
      title: "No promise of service",
      clauses: [
        "Fernway is provided as it is, for you to see how it works. It may change, pause or stop at any time, and nothing is promised about it being available or fit for any purpose.",
        "To the extent the law allows, Jerome Badour is not liable for any loss from using Fernway.",
      ],
    },
    {
      id: "the-code",
      title: "The code",
      clauses: [
        "Fernway's code is public on [GitHub](https://github.com/jeromebadour/fernway) to read. It is not open source: all rights are reserved.",
        "GoHighLevel is a trademark of HighLevel, Inc. Fernway is not made, endorsed or checked by HighLevel.",
      ],
    },
    {
      id: "changes",
      title: "Changes and contact",
      clauses: [
        "If these terms change, the new version and its date appear here before it applies.",
        `Questions: [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).`,
      ],
    },
  ],
};
