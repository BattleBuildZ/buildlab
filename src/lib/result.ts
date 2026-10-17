// Every server action returns one of these so the UI only claims success once the server confirmed it.
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };
