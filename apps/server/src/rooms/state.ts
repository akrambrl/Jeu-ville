import { MapSchema, Schema, type } from '@colyseus/schema';

/** Ce que TOUS les joueurs du quartier voient d'un personnage. */
export class PlayerState extends Schema {
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
  /** Animal qui suit le perso (« dog:2 »), ou ''. */
  @type('string') pet = '';
  /** Véhicule utilisé (« bike », « scooter ») ou ''. */
  @type('string') vehicle = '';
}

/** Commerce ouvert par un joueur dans un local : enseigne visible de tous. */
export class BusinessState extends Schema {
  @type('string') type = '';
  @type('string') name = '';
}

export class DistrictState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  /** Commerces de joueurs, par identifiant de local (PropertySpot.id). */
  @type({ map: BusinessState }) businesses = new MapSchema<BusinessState>();
}
