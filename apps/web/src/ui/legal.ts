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
  intro: "What Fernway keeps when you send one of its forms or open an account, where it goes, how long it stays and how to have it removed sooner.",
  version: "1.2",
  effective: "11 November 2026",
  short: [
    "What you type in a form goes into Fernway's demo GoHighLevel account, and stays 30 days.",
    "An account keeps what it needs to sign you in and run your plan, until you delete it; deleting removes it everywhere.",
    "One sign-in cookie for the account area; none on the public site. No analytics, no ads, nothing sold.",
  ],
  sections: [
    {
      id: "scope",
      title: "Scope",
      clauses: [
        "This policy covers the public site at fernway.jeromebadour.com: its forms (Start a trial, Contact sales, Book a demo), the tracking receipts they give you, and Track a lead; and Fernway accounts: signing up, signing in, the account area, plans and their payment, and the emails Fernway sends.",
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
      id: "accounts",
      title: "What an account keeps",
      clauses: [
        "**You:** your name, email address, the company the account is for, your time zone, when you signed up and confirmed your email, and your choices in Preferences (date and time style, which emails you get).",
        "**Your password, never as typed:** only a scrypt hash, from which the password can't be read back. The same for anything that signs you in: each session, email link, API key and recovery code is kept only as a SHA-256 fingerprint. A two-step sign-in secret is kept encrypted (AES-256-GCM), with its key held apart from the database.",
        "**Your devices:** for each sign-in, a short description your browser gives (like Firefox on Windows), when it started and when it was last used, and why it ended. Not your IP address.",
        "**Your plan:** which plan the account is on and its billing period, the Stripe customer and subscription it belongs to, and each invoice as Stripe reports it (number, date, amount, state, and Stripe's links to it). Never a card number: cards are typed into Stripe's own page, never Fernway's.",
        "**The account's own leads and API keys,** and their receipts.",
        "**Your team:** who is in the account and in which role, and each open invite (the email it went to, the role, who sent it). An invite is deleted a day after it is used, cancelled or runs out. Removing someone from the team deletes their sign-in at once.",
        "**The audit log:** what people did in the account (a resend, a route change, an invite, a key made or revoked, GHL connected or disconnected), with who did it and when. It stays with the account and goes when the account is deleted; a line keeps the name it was written with, even after that person leaves the team.",
        "The [Your record](/account/record) page in the account area shows all of this beside what GoHighLevel holds, and downloads it as a file.",
      ],
    },
    {
      id: "payments",
      title: "Payments",
      clauses: [
        "Plans are paid through **Stripe** (Stripe, Inc.), in **Stripe's test mode only**: no real money moves and no real card is charged; Stripe refuses real cards there. What you type on Stripe's page is held by Stripe under its own privacy terms.",
        "When an account's first invoice is paid, its owner is sent into **Fernway's own GoHighLevel account** as a customer (name, email, company, and a note naming the plan and invoice), with a receipt like any other lead.",
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
        "**Stripe**, for plans and their invoices, as described above.",
        "**Resend** (Resend, Inc.), which delivers Fernway's emails: confirming your address, a password reset, an invite to join a team, and the alerts you keep on. It handles each email's address and content to deliver it.",
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
        "What reaches GoHighLevel, Stripe or Resend is held in their own systems.",
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
        "**Accounts** are kept until they are deleted. A sign-in lasts 30 days, then ends by itself; ended sign-ins stay listed on Devices for 30 days. The lead that moved an owner to customer in GoHighLevel stays while the account does.",
        "**Limits on signing in:** tries are counted per IP address and per email for about an hour, then the count is deleted.",
      ],
    },
    {
      id: "sooner",
      title: "Removed sooner",
      clauses: [
        "To have your lead removed before its 30 days are up, write to [privacy@jeromebadour.com](mailto:privacy@jeromebadour.com) from the email address you sent it with, and include its waybill number if you have it. It will be removed from GoHighLevel and from Fernway.",
        "**An account** is deleted by its owner in the account area: first from GoHighLevel (what Fernway made there from your forms), then from Stripe (the customer, which cancels a plan and removes the card), then from Fernway (the account, its people, sign-ins, keys, leads and receipts). Each step is shown as it happens. Backups then hold it for up to 30 more days, as above.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies",
      clauses: [
        "The public site sets **no cookies**. Its fonts are served from our own server, so loading a page tells no one else you visited.",
        "Signing in sets **one cookie**, `fw_session`: it keeps you signed in for up to 30 days, is sent only to Fernway over HTTPS, and can't be read by the page's scripts. Signing out ends it. Stripe's payment page, on Stripe's own site, sets Stripe's own cookies.",
        "There are no advertising, tracking or third-party cookies.",
      ],
    },
    {
      id: "age",
      title: "Age",
      clauses: ["Fernway's forms and accounts are meant for adults, acting for themselves or the business they work for."],
    },
    {
      id: "changes",
      title: "Changes and contact",
      clauses: [
        "Version 1.1 added accounts, payments and emails; version 1.2 adds teams (invites and roles) and the audit log. A new version and its date appear here before it applies.",
        `Questions, or a request about your data: [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).`,
      ],
    },
  ],
};

export const terms: LegalDoc = {
  title: "Terms of Use",
  intro: "What Fernway is, what sending one of its forms does and doesn't do, and what you agree to by using it.",
  version: "1.1",
  effective: "11 November 2026",
  short: [
    "Fernway is a portfolio product, not a company or a service for sale.",
    "Accounts and plans work, but payments run in Stripe's test mode: nothing is ever charged.",
    "Sending a form shows the delivery working; it doesn't start a contract.",
    "Messages through Contact sales reach Jerome Badour, who answers them.",
  ],
  sections: [
    {
      id: "what-fernway-is",
      title: "What Fernway is",
      clauses: [
        "Fernway is a **portfolio product** built and run by Jerome Badour, an independent developer, to show a working GoHighLevel integration: real forms, a real delivery queue, a real GoHighLevel account. It is not a registered company and is not offered for sale.",
        "Its plans and prices describe how Fernway would be priced as a product. A plan can be picked and paid for, but only in **Stripe's test mode**: no real money moves, and Stripe refuses real cards there. No one can buy Fernway.",
      ],
    },
    {
      id: "the-forms",
      title: "The forms",
      clauses: [
        "**Start a trial** and **Book a demo** show the delivery working, end to end, with your own details: your lead goes into Fernway's demo GoHighLevel account and you can watch it arrive. Sending them does not open an account or commit anyone to a meeting.",
        "**Contact sales** messages reach Jerome Badour, who reads and answers them.",
        "Send only your own details, or details you are allowed to share. Do not send anything sensitive: passwords, payment details, health or other private information.",
        "The forms take a few sends per visitor an hour, and only so many a day, to keep the demo from being flooded.",
      ],
    },
    {
      id: "accounts",
      title: "Accounts",
      clauses: [
        "**Sign up** opens a Fernway account on a 14-day trial, for you as its owner. Keep your password and recovery codes to yourself; you are responsible for what is done with your sign-in.",
        "Delete the account whenever you like from the account area; what that removes is set out in the [Privacy Policy](/privacy). An account that breaks these terms may be closed.",
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
