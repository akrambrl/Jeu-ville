/** Erreur métier dont le message peut être montré tel quel au joueur. */
export class GameError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'GameError';
  }
}
