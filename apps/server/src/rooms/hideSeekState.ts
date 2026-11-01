import { MapSchema, Schema, type } from '@colyseus/schema';

/** Personnage visible de TOUS (salon, résultats, chercheurs pendant la partie). */
export class BodyState extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('float32') x = 0;
  @type('float32') y = 0;
  /** Direction 0→7 (0 = +x, sens horaire, par pas de 45°). */
  @type('uint8') dir = 0;
  @type('boolean') moving = false;
  @type('string') sex = 'male';
  @type('uint8') baseLook = 0;
  @type('uint8') skinTone = 0;
  @type('uint8') hairColor = 0;
  @type('uint8') bodyType = 0;
  /** 'none' | 'hider' | 'seeker'. */
  @type('string') role = 'none';
  @type('boolean') bot = false;
}

/** Participant de la partie, sans sa position (elle peut être secrète). */
export class RosterEntry extends Schema {
  @type('string') name = '';
  @type('string') role = 'none';
  /** 'lobby' | 'playing' | 'eliminated' | 'spectating'. */
  @type('string') status = 'lobby';
  @type('boolean') bot = false;
  /** Chercheur : joueurs trouvés. */
  @type('uint8') found = 0;
}

export class HideSeekState extends Schema {
  /** 'lobby' | 'hiding' | 'seeking' | 'ended'. */
  @type('string') phase = 'lobby';
  /** Secondes restantes dans la phase (0 : salon en attente de joueurs). */
  @type('uint16') remainingS = 0;
  @type('uint16') round = 0;
  /** '' | 'hiders' | 'seekers'. */
  @type('string') winner = '';
  @type('uint8') hidersAlive = 0;
  @type('uint8') hidersTotal = 0;
  @type({ map: BodyState }) bodies = new MapSchema<BodyState>();
  @type({ map: RosterEntry }) roster = new MapSchema<RosterEntry>();
}
