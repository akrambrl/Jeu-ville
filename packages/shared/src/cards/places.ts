/**
 * Villes acceptées dans la catégorie « Pays ou ville », en plus des pays et des
 * villes de words.ts : préfectures, sous-préfectures et villes moyennes de
 * France (métropole et outre-mer), communes d'Île-de-France, grandes villes du
 * monde. Les doublons avec words.ts sont sans effet.
 */

/** Villes de France : préfectures, sous-préfectures et villes de plus de ~15 000 habitants. */
export const FRENCH_CITIES = `
  Abbeville, Agde, Agen, Aix-en-Provence, Aix-les-Bains, Ajaccio, Albertville, Albi, Alençon, Alès, Ambert, Amboise, Amiens, Angers, Anglet, Angoulême, Annecy, Annemasse, Annonay, Antibes, Apt, Arcachon, Argelès-sur-Mer, Argentan, Arles, Armentières, Arras, Aubagne, Aubenas, Auch, Aurillac, Autun, Auxerre, Avallon, Avignon, Avranches,
  Bagnères-de-Bigorre, Bagnols-sur-Cèze, Bar-le-Duc, Bar-sur-Aube, Barcelonnette, Bastia, Bayeux, Bayonne, Beaune, Beauvais, Belfort, Belley, Bergerac, Bernay, Besançon, Béthune, Béziers, Biarritz, Blaye, Blois, Bonneville, Bordeaux, Boulogne-sur-Mer, Bourg-en-Bresse, Bourges, Bourgoin-Jallieu, Brest, Briançon, Brignoles, Brive-la-Gaillarde, Bressuire,
  Caen, Cagnes-sur-Mer, Cahors, Calais, Calvi, Cambrai, Cannes, Carcassonne, Carpentras, Castelnaudary, Castelsarrasin, Castres, Cavaillon, Céret, Chalon-sur-Saône, Châlons-en-Champagne, Chambéry, Chamonix, Charleville-Mézières, Chartres, Châteaubriant, Château-Chinon, Châteaudun, Château-Gontier, Châteauroux, Château-Thierry, Châtellerault, Chaumont, Cherbourg, Cholet, Clamecy, Clermont-Ferrand, Cognac, Colmar, Commercy, Compiègne, Concarneau, Condom, Confolens, Corte, Cosne-Cours-sur-Loire, Coutances, Creil, Créteil,
  Dax, Deauville, Dieppe, Digne-les-Bains, Dijon, Dinan, Dole, Douai, Dourdan, Draguignan, Dreux, Dunkerque,
  Embrun, Épernay, Épinal, Étampes, Évreux, Évry, Figeac, Foix, Fontainebleau, Forcalquier, Fougères, Fréjus,
  Gaillac, Gap, Gex, Gien, Gourdon, Granville, Grasse, Grenoble, Guéret, Guingamp,
  Haguenau, Hazebrouck, Hendaye, Honfleur, Hyères, Issoire, Istres,
  Jonzac, La Ciotat, La Flèche, La Rochelle, La Roche-sur-Yon, La Seyne-sur-Mer, La Teste-de-Buch, Lannion, Laon, Largentière, Laval, Le Creusot, Le Puy-en-Velay, Lens, Lesparre-Médoc, Libourne, Lille, Limoux, Lisieux, Loches, Lodève, Lons-le-Saunier, Lorient, Loudun, Louhans, Lourdes, Lunel, Lunéville,
  Mâcon, Mamers, Mantes-la-Jolie, Marmande, Martigues, Maubeuge, Mauriac, Mayenne, Meaux, Melun, Mende, Menton, Millau, Mirande, Molsheim, Montargis, Montauban, Montbard, Montbéliard, Montbrison, Mont-de-Marsan, Montélimar, Montluçon, Montmorillon, Morlaix, Mortagne-au-Perche, Moulins,
  Nanterre, Narbonne, Nérac, Neufchâteau, Nevers, Niort, Nogent-sur-Seine, Nyons,
  Oloron-Sainte-Marie, Orange, Pamiers, Parthenay, Périgueux, Péronne, Pertuis, Pithiviers, Ploërmel, Poissy, Pontarlier, Pontivy, Pontoise, Prades, Privas, Provins,
  Quimper, Quimperlé, Rambouillet, Redon, Remiremont, Rethel, Riom, Roanne, Rochefort, Rodez, Romorantin-Lanthenay, Roubaix, Royan,
  Saint-Amand-Montrond, Saint-Brieuc, Saint-Claude, Saint-Dié-des-Vosges, Saint-Dizier, Saint-Flour, Saint-Gaudens, Saint-Germain-en-Laye, Saint-Girons, Saint-Jean-d'Angély, Saint-Jean-de-Luz, Saint-Jean-de-Maurienne, Saint-Lô, Saint-Malo, Saint-Nazaire, Saint-Omer, Saint-Quentin, Saint-Raphaël, Saint-Tropez, Sainte-Menehould, Saintes, Salon-de-Provence, Sarlat-la-Canéda, Sarrebourg, Sarreguemines, Sartène, Saumur, Saverne, Sedan, Segré, Sélestat, Senlis, Sens, Sète, Soissons, Thionville, Thonon-les-Bains, Toul, Tournon-sur-Rhône, Tourcoing, Troyes, Tulle,
  Ussel, Uzès, Valenciennes, Vannes, Vendôme, Verdun, Vernon, Vesoul, Vichy, Vienne, Vierzon, Vigan, Villefranche-de-Rouergue, Villefranche-sur-Saône, Villeneuve-sur-Lot, Vire, Vitré, Vitry-le-François, Voiron, Vouziers, Wissembourg, Yssingeaux, Yvetot
`;

/** Communes d'Île-de-France (dont toute la Seine-Saint-Denis). */
export const ILE_DE_FRANCE_CITIES = `
  Antony, Argenteuil, Asnières-sur-Seine, Athis-Mons, Aubervilliers, Aulnay-sous-Bois, Bagneux, Bagnolet, Bobigny, Bois-Colombes, Boissy-Saint-Léger, Bondy, Boulogne-Billancourt, Bourg-la-Reine, Bry-sur-Marne,
  Cachan, Cergy, Champigny-sur-Marne, Charenton-le-Pont, Chatou, Châtillon, Chelles, Choisy-le-Roi, Clamart, Clichy, Clichy-sous-Bois, Colombes, Corbeil-Essonnes, Coubron, Courbevoie, Drancy, Dugny,
  Épinay-sur-Seine, Ermont, Fontenay-sous-Bois, Fresnes, Gagny, Garges-lès-Gonesse, Gennevilliers, Gonesse, Gournay-sur-Marne, Grigny, Issy-les-Moulineaux, Ivry-sur-Seine, Joinville-le-Pont,
  L'Haÿ-les-Roses, L'Île-Saint-Denis, La Courneuve, Le Blanc-Mesnil, Le Bourget, Le Kremlin-Bicêtre, Le Perreux-sur-Marne, Le Pré-Saint-Gervais, Le Raincy, Les Lilas, Les Mureaux, Les Pavillons-sous-Bois, Levallois-Perret, Livry-Gargan,
  Maisons-Alfort, Malakoff, Marne-la-Vallée, Massy, Meudon, Montfermeil, Montreuil, Montrouge, Nanterre, Neuilly-Plaisance, Neuilly-sur-Marne, Neuilly-sur-Seine, Nogent-sur-Marne, Noisy-le-Grand, Noisy-le-Sec,
  Orly, Palaiseau, Pantin, Pierrefitte-sur-Seine, Puteaux, Romainville, Rosny-sous-Bois, Rueil-Malmaison, Saint-Denis, Saint-Maur-des-Fossés, Saint-Ouen, Sarcelles, Sartrouville, Savigny-sur-Orge, Sceaux, Sevran, Stains, Suresnes,
  Tremblay-en-France, Vaujours, Versailles, Villejuif, Villemomble, Villeneuve-Saint-Georges, Villepinte, Villetaneuse, Vincennes, Vitry-sur-Seine
`;

/** Outre-mer. */
export const OVERSEAS_CITIES = `
  Basse-Terre, Baie-Mahault, Cayenne, Fort-de-France, Kourou, Le Lamentin, Le Port, Le Tampon, Les Abymes, Mamoudzou, Nouméa, Papeete, Pointe-à-Pitre, Saint-Laurent-du-Maroni, Saint-Paul, Saint-Pierre, Sainte-Marie, Saint-Denis de la Réunion, Schœlcher
`;

/** Grandes villes du monde. */
export const WORLD_CITIES = `
  Abu Dhabi, Accra, Addis-Abeba, Agadir, Alexandrie, Amman, Ankara, Annaba, Antananarivo, Anvers, Atlanta, Auckland,
  Bagdad, Bakou, Bâle, Bangui, Barcelone, Batna, Beyrouth, Belgrade, Bejaia, Benghazi, Bergen, Berne, Bilbao, Birmingham, Bogota, Bologne, Bombay, Bonn, Bouaké, Brazzaville, Bristol, Brooklyn, Bucarest, Buenos Aires,
  Le Caire, Calcutta, Cancún, Cardiff, Carthage, Chicago, Cologne, Constantine, Cotonou, Cracovie, Dallas, Damas, Delhi, Denver, Detroit, Djeddah, Djerba, Dortmund, Douala, Dubrovnik, Durban,
  Édimbourg, Essaouira, Fès, Francfort, Freetown, Gand, Gênes, Glasgow, Göteborg, Grenade, Guangzhou,
  Hambourg, Hanoï, Harare, Helsinki, Hong Kong, Honolulu, Houston, Ibiza, Islamabad, Izmir,
  Jakarta, Johannesburg, Kaboul, Kairouan, Kampala, Karachi, Katmandou, Kiev, Kigali, Kyoto,
  La Havane, La Mecque, La Paz, Lahore, Las Vegas, Leeds, Leipzig, Libreville, Liège, Lima, Liverpool, Lomé, Louxor, Luanda, Lyon,
  Malaga, Manchester, Manille, Maputo, Marbella, Medellín, Meknès, Melbourne, Mexico, Minsk, Mogadiscio, Monaco, Monastir, Monrovia, Montevideo, Mostaganem, Mumbai, Munich,
  Nador, Nairobi, Nankin, Naples, Niamey, Nouakchott, Ouagadougou, Oujda, Osaka, Ottawa,
  Palerme, Palma, Pékin, Philadelphie, Phnom Penh, Pise, Porto, Port-au-Prince, Pretoria, Québec, Rabat, Riga, Riyad,
  Saint-Pétersbourg, Salvador de Bahia, San Francisco, Santiago, São Paulo, Sarajevo, Seattle, Sétif, Séoul, Sfax, Shanghai, Sidi Bel Abbès, Sofia, Sousse, Stockholm, Stuttgart,
  Tachkent, Tamanrasset, Tbilissi, Téhéran, Tel Aviv, Tétouan, Tijuana, Tirana, Tlemcen, Toronto, Tripoli, Turin,
  Valence, Vancouver, Varsovie, Vérone, Vilnius, Washington, Wellington, Yaoundé, Yokohama, Zagreb, Zurich
`;
