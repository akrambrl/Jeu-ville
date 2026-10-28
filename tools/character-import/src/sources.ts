/**
 * Personnages 3D : « Ultimate Modular Men / Women » de Quaternius (CC0,
 * https://quaternius.com), fichiers glTF hébergés sur le Google Drive de l'auteur.
 * Les tenues proposées à la création du perso sont listées dans BASE_LOOKS (shared).
 */
export interface CharacterSource {
  /** Nom du fichier produit : apps/client/src/assets/models/people/<out>.glb */
  out: string;
  driveId: string;
  sex: 'male' | 'female';
}

export const SOURCES: CharacterSource[] = [
  { out: 'male-casual', driveId: '1Jn7kULNmrtqP8BUUL19h8MhbdOnwPFhv', sex: 'male' },
  { out: 'male-hoodie', driveId: '1em1So1xwwQNfHJYMvzKcXkZllvtxpKP5', sex: 'male' },
  { out: 'male-suit', driveId: '1NhXHnGU0zK9hBrT5FoZp8nTz_EmvTPg5', sex: 'male' },
  { out: 'male-punk', driveId: '1yHWu5ezXq4dYBcn4sWiNd16YN9fMtXo0', sex: 'male' },
  { out: 'male-beach', driveId: '1IL1YJPJvNkuGnKI69-W-VMBIDCo-u49N', sex: 'male' },
  { out: 'male-worker', driveId: '14d8n7IDnnlnGt_uiATnNg3uvi_4dyd9V', sex: 'male' },
  { out: 'female-casual', driveId: '18b3WwlrwrFYWAM7BcnjWeIxKJyxAQiGh', sex: 'female' },
  { out: 'female-adventurer', driveId: '1uxAFnDp73NO1c16LvHHjAYh1-deMNk5I', sex: 'female' },
  { out: 'female-formal', driveId: '1iayBzVv_zLjuPtaNPouw_auwKlQLLmes', sex: 'female' },
  { out: 'female-punk', driveId: '1ITb_iFiroAsmjQI38z_p6nNXinwliVLA', sex: 'female' },
  { out: 'female-suit', driveId: '1GjWtofxjmPku25cXJxHrzLLeUbXw7A_s', sex: 'female' },
  { out: 'female-worker', driveId: '1iwF_fqDErPH9uyol6NmS-MnzGgsZ5ejV', sex: 'female' },
];

/** Animations gardées (nom Quaternius → nom utilisé par le jeu). Le reste (armes, combats) est retiré. */
export const ANIMATIONS: Record<string, string> = {
  Idle: 'idle',
  Walk: 'walk',
  Run: 'sprint',
  Wave: 'emote',
  Interact: 'interact',
};
