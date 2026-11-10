import "server-only";
// The signed-in person and their account. Until sign-in is built (step 5) this returns the invented demo owner used for
// the account area's pictures; the pages read only this, so wiring the real session changes this file alone.
export type Me = {
  name: string; email: string; emailConfirmed: boolean; company: string; role: "Owner" | "Admin" | "Member";
  photo: string | null; timeZone: string; accountNo: string; since: string; plan: string;
};

export async function me(): Promise<Me> {
  return {
    name: "Lena Hartmann", email: "lena@northpine.dental", emailConfirmed: true, company: "Northpine Dental", role: "Owner",
    photo: null, timeZone: "Europe/Berlin", accountNo: "AC 26 0001", since: "2026-11-10T09:12:00Z", plan: "Growth",
  };
}
