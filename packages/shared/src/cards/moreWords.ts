/**
 * Mots acceptés en plus de ceux de words.ts pour les catégories qui étaient
 * les plus courtes : parties du corps, vêtements, plats et desserts, sports,
 * objets de la maison. Les doublons sont sans effet.
 */

export const MORE_BODY_PARTS = `
  abdomen, abdominaux, adénoïdes, aine, alvéole, amygdale, annulaire, anus, aorte, appendice, arcade, arcade sourcilière, artère, astragale, auriculaire, avant-bras, axe,
  barbe, bassin, biceps, bouche, bourse, bras, bronche, bronchiole, buste,
  cæcum, calcanéum, canine, capillaire, carotide, cartilage, cellule, cerveau, cervelet, cervicales, chair, cheveu, cheville, clavicule, coccyx, cœur, col du fémur, colonne vertébrale, côlon, conduit auditif, cornée, côte, cou, coude, crâne, cristallin, cubitus, cuir chevelu, cuisse,
  deltoïde, dent, derme, diaphragme, doigt, dos, duodénum,
  émail, épaule, épiderme, épiglotte, estomac,
  fémur, fesse, fibula, foie, follicule, fossette, front,
  ganglion, gencive, genou, glande, glotte, gorge, gros intestin, gros orteil,
  hanche, humérus, hypophyse, hypothalamus,
  index, incisive, intestin, iris,
  jambe, joue, jugulaire,
  langue, larynx, lèvre, ligament, lobe, lombaires,
  majeur, mâchoire, main, mamelon, mandibule, mâchoire, molaire, mollet, moelle épinière, moelle osseuse, morve, moustache, muqueuse, muscle,
  narine, nerf, nez, nombril, nuque,
  occiput, œil, œsophage, omoplate, ongle, orbite, oreille, orteil, os, ovaire,
  palais, pancréas, paume, paupière, peau, pectoraux, pénis, péroné, phalange, pharynx, pied, pied-de-biche, pilosité, plante du pied, pli, poignet, poil, poing, poitrine, pommette, pore, pouce, poumon, prostate, pubis, pupille,
  quadriceps,
  radius, rate, rectum, rein, rétine, rotule,
  sacrum, salive, sang, scapula, sein, septum, sinus, sourcil, squelette, sternum, synapse,
  talon, tempe, tendon, tendon d'Achille, testicule, thorax, thyroïde, tibia, tissu, trachée, trapèze, triceps, tronc, tympan,
  urètre, utérus, uvule,
  vagin, veine, ventre, vertèbre, vésicule, vessie, visage, voûte plantaire,
  zygomatique
`;

export const MORE_CLOTHING = `
  abaya, anorak, ballerines, bandana, bandeau, barboteuse, bas, basket, bavoir, bermuda, blouse, bob, bodie, boléro, bombers, boots, bottines, boxer, brassière, burkini,
  cache-cou, cache-nez, cagoule, caftan, cardigan, cape, capuche, chapka, charentaises, chaussons, chèche, chemise de nuit, chino, claquettes, collier, corsaire, corset, costume trois-pièces, crop top, cuissardes, culotte, cycliste,
  dentelle, derbies, doudoune sans manches, duffle-coat, espadrilles,
  fedora, fichu, fourrure, fuseau,
  gabardine, gandoura, gilet de sauvetage, gilet jaune, gaine, haut, hoodie, jabot, jarretière, jogging, jupon, justaucorps,
  kilt, knickers, lavallière, liquette, lunettes, lingerie,
  maillot de bain, maillot de foot, marcel, marinière, minijupe, mocassins, mules,
  nuisette, overall, pagne, paletot, palazzo, panama, pantacourt, pantalon cargo, pardessus, pareo, paréo, peignoir, pelisse, perfecto, poncho, pull-over,
  qamis, robe de chambre, robe de soirée, salopette, sarouel, saharienne, sabots, serre-tête, shorty, smoking, sneakers, socquettes, sous-vêtement, sous-pull, string, survêt, sweat à capuche,
  tailleur, tanga, tenue, toge, top, trench, trench-coat, tricot, tutu, twin-set,
  ugg, veste en jean, veston, voilette, wax
`;

export const MORE_DISHES = `
  aligot, andouillette, apple pie, arancini, baba au rhum, baghrir, baklava, banana split, beignet, beignets de crevettes, biryani, blanquette de veau, blinis, bœuf bourguignon, bœuf strogonoff, boulettes, bouchée à la reine, bouillon, bourek, bricks, brochette, bruschetta, bûche de Noël, burrito,
  cake, cannelé, carbonara, carpaccio, cervelle de canut, charlotte, cheesecake, chicken curry, chicken wings, chips, chorba, chou à la crème, chouquette, churros, cookie, coq au vin, cordon bleu, côte de bœuf, couscous royal, crème brûlée, crème caramel, croque-madame, curry,
  dahl, dinde aux marrons, dolma, donut, dürüm,
  enchilada, entrecôte, escalope, escargots,
  far breton, filet mignon, financier, fish and chips, flammekueche, fondant au chocolat, forêt noire, fraisier, frites maison, fricassée, frittata,
  gâteau au chocolat, gaspacho, gnocchis, goulash, granité, gratin de pâtes, guacamole, gyros,
  hachis, hot-dog, huîtres, île flottante,
  kebab, kefta, kouign-amann, korma,
  lahmacun, lasagne, lentilles saucisses, loukoum,
  mac and cheese, magret de canard, maki, manti, mazagran, merguez, meringue, minestrone, moussaka, muffin, mloukhia,
  naan, navarin, nachos, nugget, nuggets,
  omelette norvégienne, onigiri, osso buco,
  pad thaï, pain au chocolat, pancake, panna cotta, paris-brest, pastèque, pâté, pavlova, pho, pièce montée, pilaf, pissaladière, pita, pizza margherita, poulet basquaise, poulet tikka, profiteroles, pudding,
  quenelles, quesadilla, ravioli, rillettes, riz au lait, riz cantonais, rôti, roulé, rösti,
  saint-honoré, samoussa, sardines, sashimi, saucisse, savarin, shawarma, smoothie, sorbet, soufflé, soupe à l'oignon, spaghetti bolognaise, steak, steak frites, strudel,
  tablette, tagliatelles, tapas, taboulé, tarte aux pommes, tarte tatin, tchoutchouka, tempura, terrine, tomates farcies, tortilla, tourte, tournedos, tteokbokki,
  velouté, vermicelles, wrap, yaourt, yakitori, zlabia
`;

export const MORE_SPORTS = `
  aérobic, apnée, aquagym, arts martiaux, athlétisme, badminton, ballon prisonnier, base-jump, beach-volley, bobsleigh, boccia, body-board, boules, boxe anglaise, boxe thaï, bridge, canyoning, char à voile, cheerleading, course à pied, course d'orientation, cross, culturisme,
  dodgeball, échecs, équitation, escalade, esport, fitness, flag football, football américain, footvolley, freestyle, frisbee,
  gymnastique rythmique, hand, hockey sur glace, horse-ball, jet-ski, judo, karting, kendo, kick-boxing, krav-maga, kung-fu, lancer de poids, luge,
  marche, marche nordique, motoneige, muay thaï, nage, natation synchronisée, padel, paddle, paintball, patin à glace, pelote basque, pentathlon, pilates, planche à voile, plongeon, polo, quidditch,
  rallye, rando, rink hockey, roller derby, rugby à sept, saut à la perche, saut en hauteur, saut en longueur, savate, sambo, skate, ski de fond, ski nautique, slackline, softball, speedminton, spinning, sprint, step, street workout,
  tennis de table, tir, tir à la carabine, trail, trampoline, triathlon, ultra-trail, voile, volley-ball, wakeboard, windsurf, wingsuit, yoga, yachting
`;

export const MORE_HOUSE_OBJECTS = `
  abat-jour, aimant, allumette, ampoule, aquarium, arrosoir, aspirateur robot,
  balance, banc, banquette, barbecue, bassine, batteur, berceau, bibelot, bibliothèque, blender, bocal, boîte, bouteille, brosse, brosse à dents, buffet,
  cadre, cafetière, canapé-lit, carafe, casier, cendrier, chaise haute, chandelier, chargeur, chauffage, cheminée, chevet, clé, climatiseur, coffre, commode, congélateur, console, corbeille, coupe, couette, couvert, crayon, cuvette,
  déshumidificateur, dessous-de-plat, divan, dressing, écumoire, égouttoir, enceinte, entonnoir, escabeau, essuie-tout,
  fer à lisser, fontaine, fouet, four à micro-ondes, friteuse, frigo américain,
  gant de toilette, gaufrier, grille-pain, guéridon,
  hamac, horloge murale, housse, humidificateur,
  imprimante, jardinière, jeu de société,
  lampadaire, lampe de chevet, lave-vaisselle, lessive, lit superposé, louche, lustre,
  manette, marmite, mixeur, moulin à café, moquette,
  nappe, nattes, ordinateur portable,
  paillasson, panier, parapluie, paravent, passoire, patère, penderie, pendule, percolateur, plaid, plateau, plaque de cuisson, planche à repasser, plumeau, porte-manteau, pot de fleurs, pouf,
  radiateur électrique, rallonge, râpe, rasoir, réchaud, robot de cuisine, rouleau à pâtisserie,
  sac poubelle, salière, sèche-linge, sécateur, serpillère, sopalin, sofa, sommier, spatule, sucrier, suspension,
  table basse, table de nuit, tablette, taie d'oreiller, tasse à café, théière, thermomètre, tire-bouchon, toaster, tondeuse, tournevis, trousseau, tupperware,
  ustensile, vaisselier, vaisselle, veilleuse, verre à pied, vide-poche, wok
`;

export const MORE_ANIMALS = `
  addax, albatros, alouette, anaconda, ânesse, anchois, ara, autour, axolotl,
  babouin, barracuda, bar, bécasse, belette, béluga, bernard-l'ermite, bichon, blatte, boa, bonobo, bouledogue, bouquetin, bousier, brebis, brochet, bulldog, buffle d'Afrique,
  cabri, cacatoès, cafard, calamar, caméléon, canari, capucin, capybara, caracal, caribou, carcajou, casoar, chaton, chenille, chevreau, chiot, chihuahua, cobra, cochon d'Inde, colvert, condor, coquillage, corneille, couguar, coucou, couleuvre, crapaud-buffle, criquet, crotale,
  daim, daurade, dingo, doberman, dodo, dorade, dragon de Komodo, dugong,
  éléphant de mer, émeu, éperlan, épagneul, épervier, escargot de Bourgogne, esturgeon, étalon,
  faon, fauvette, fennec, fouine, frelon,
  gardon, gavial, geai, gerbille, gibbon, gnou, goéland, golden retriever, gorgone, grizzli, grue, guenon, guppy,
  hareng, harfang, hermine, héron, hippocampe, husky, hydre,
  ibis, jument, kiwi, krill,
  labrador, lamantin, lamproie, langouste, langoustine, lapereau, lémurien, léopard, limace, lionceau, loir, lombric, loriot, louveteau, luciole,
  macaque, mainate, mammouth, manchot, mante religieuse, marcassin, martin-pêcheur, martre, merlu, mille-pattes, mite, moule, mouflon, mulot, musaraigne,
  narval, nasique, okapi, opossum, orang-outang, ornithorynque, oryx, otarie, ouistiti, ourson,
  pangolin, panda roux, papillon de nuit, pélican, perdrix, perche, phacochère, pic-vert, pinson, pitbull, poisson rouge, poisson-clown, poney shetland, pou, poulain, poulet, pygargue, python,
  quetzal, rainette, raie, rascasse, ratel, raton, renardeau, rhinocéros blanc, rorqual, roussette, rottweiler,
  sajou, salamandre, sardine, scolopendre, serin, silure, sole, suricate, sole, sphinx,
  tamanoir, tamarin, tanche, tapir, tarentule, termite, tétras, thon, tique, tigre blanc, triton, tyrannosaure,
  vache laitière, varan, veau, vers à soie, vigogne, vipère aspic, vison, wapiti, wombat, yack, yak, zébu
`;
