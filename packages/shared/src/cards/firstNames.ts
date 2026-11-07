/**
 * Prénoms acceptés, en plus de ceux de words.ts : prénoms courants en France,
 * anglophones, turcs, asiatiques, africains et latinos, avec leurs variantes d'orthographe (Henri / Henry,
 * Mohamed / Mohammed, Yanis / Yannis…). Les doublons sont sans effet.
 */
export const MORE_FIRST_NAMES = `
  Aaliyah, Abdallah, Abdelkader, Abdoul, Abdoulaye, Abel, Abigaïl, Achille, Adel, Adeline, Adem, Adrian, Adriana, Agathe, Agnès, Ahmad, Aïda, Ali, Alia, Alicia, Aliya, Allan, Alma, Aloïs, Alyssa, Amaury, Ambre, Amina, Aminata, Amine, Anaëlle, Andrea, Andy, Ange, Angela, Angelo, Anissa, Annabelle, Anne-Sophie, Antonin, Apolline, Ariane, Arnaud, Arsène, Assia, Assane, Astrid, Audrey, Augustin, Aurore, Ava, Axelle, Aylan, Ayman, Aymeric, Aziz,
  Bakary, Barbara, Bérénice, Bernadette, Bertrand, Bettina, Bianca, Billal, Blaise, Brandon, Brice, Bryan,
  Calvin, Capucine, Carine, Carmen, Cassandra, Cécile, Cédric, Célia, Céline, Cheikh, Cherif, Chris, Christelle, Christophe, Cindy, Claudia, Clémence, Clothilde, Colin, Constance, Corentin, Cyrine,
  Dalia, Damien, Dan, Daphné, Davy, Déborah, Diana, Diego, Djamel, Djenna, Dorian, Doriane, Driss,
  Edgar, Edith, Eliott, Elliot, Éléonore, Eléa, Élia, Éliane, Ella, Ellie, Eloïse, Emeline, Émile, Émilie, Emilio, Emir, Enola, Ernest, Esther, Estelle, Eugène, Eva, Évelyne, Ewan, Ezra,
  Fabrice, Fadi, Fanny, Farid, Fatoumata, Félix, Ferdinand, Fernand, Flavie, Flora, Francis, Franck, Françoise, Fred,
  Gabin, Gaëlle, Gaétan, Garance, Gauthier, Geneviève, Gérald, Ginette, Gisèle, Giulia, Grace, Guy,
  Haby, Hadrien, Haïssa, Hanna, Hannah, Harry, Hassan, Hawa, Héloïse, Henry, Hind, Hiba, Honoré, Houssem, Hubert, Hussein,
  Ibrahima, Ida, Ilana, Ilian, Ilyas, Ilyès, Inaya, Irène, Iris, Isaïah, Ismail, Ivan, Izia,
  Jacob, Jamal, Jamila, Janine, Jason, Jawad, Jayden, Jean-Baptiste, Jean-Pierre, Jessica, Jessy, Jibril, Joachim, Joanna, Johan, John, Jonas, Josué, Juan, Judith, Julia, Julian, Julien, Junior,
  Kaïs, Kamel, Karl, Karla, Katia, Kawtar, Keïta, Kelyan, Kenan, Kenzo, Kevin, Khalil, Kiara, Kim, Kylian, Kilian, Killian,
  Laetitia, Lamia, Lana, Laurie, Layla, Leila, Leïla, Lenny, Léonie, Léopold, Lili, Lilou, Lily, Lindsay, Linda, Lino, Lionel, Loane, Lorenzo, Lou, Louna, Luca, Lucien, Lukas, Luna, Lydia,
  Maël, Maëlle, Maëlys, Mahamadou, Mahé, Maïa, Maïssa, Mamadi, Marcel, Margot, Mariama, Marianne, Marina, Mario, Marwa, Marwan, Mathéo, Matteo, Mattéo, Maude, Maureen, Max, Maya, Medhi, Mélina, Mia, Mickaël, Michael, Michaël, Mila, Milan, Mohammed, Mohammad, Mouhamed, Mounir, Mustapha, Myriam,
  Naïm, Naïma, Nadège, Nahia, Naomi, Nassim, Nathan, Nelly, Nelson, Neyla, Nils, Noam, Noélie, Noémie, Nolan, Norah, Nordine,
  Octave, Odette, Olga, Olivia, Ophélie, Oriane, Ornella, Oumou, Owen,
  Paola, Pascale, Patricia, Paulin, Pénélope, Perrine, Philomène, Pierre-Louis, Prosper,
  Quentin, Rafael, Rahim, Rami, Ramzi, Raoul, Raphaëlle, Rayane, Rebecca, Redouane, Régis, Renée, Richard, Rita, Robert, Rodrigue, Roger, Romane, Romy, Rosalie, Roxane, Ruben, Rudy,
  Sabri, Sacha, Safa, Safiya, Saïd, Saïda, Salim, Salma, Salomon, Sami, Samy, Sana, Sandrine, Sara, Sasha, Selim, Sélène, Seydou, Sidi, Simon, Simone, Sirine, Siham, Solal, Solène, Souleymane, Stella, Steven, Sven, Sylvain, Syrine,
  Tanguy, Tatiana, Tessa, Théa, Thibault, Thibaut, Thierry, Tiago, Timéo, Tiphaine, Toufik, Tony,
  Ulysse, Valentine, Véronique, Victoire, Vincent, Violette, Vivien, Wael, Warren, Wilfried, Willy, Wissam,
  Yann, Yannis, Yassine, Yasmina, Yassin, Yoan, Yohan, Yoann, Younes, Youssouf, Yuna, Yusuf,
  Zacharie, Zack, Zaïd, Zara, Zayn, Zeynep, Zinedine, Zineb, Zohra
`;

/** Prénoms anglophones (Royaume-Uni, États-Unis, Irlande…). */
export const ENGLISH_FIRST_NAMES = `
  Abigail, Ada, Aiden, Alan, Albert, Alfie, Alice, Amber, Amelia, Amy, Andrew, Anthony, Archie, Arthur, Ashley, Austin, Barry, Ben, Benjamin, Beth, Betty, Billy, Blake, Bob, Bonnie, Brad, Bradley, Brenda, Brian, Brooke, Caleb, Cameron, Carl, Carol, Caroline, Carter, Charlie, Chase, Chelsea, Chloe, Christopher, Cody, Colin, Connor, Courtney, Daisy, Dakota, Darren, Dave, Dean, Debbie, Dennis, Derek, Dexter, Donna, Dorothy, Dylan, Eddie, Edward, Eleanor, Elijah, Elizabeth, Emily, Ethan, Evelyn, Finn, Frank, Freddie, Gary, Gavin, George, Grace, Graham, Hailey, Harper, Harrison, Hayden, Heather, Helen, Henry, Holly, Hunter, Ian, Isaac, Isabella, Isla, Jack, Jackson, Jacob, Jake, James, Jamie, Jane, Jasmine, Jason, Jeff, Jennifer, Jenny, Jeremy, Jessica, Jill, Jim, Jimmy, Joe, Joey, John, Johnny, Jordan, Joseph, Josh, Joshua, Joyce, Judy, Justin, Karen, Kate, Katie, Keith, Kelly, Ken, Kevin, Kyle, Laura, Lauren, Leo, Liam, Lily, Linda, Lisa, Logan, Lucy, Luke, Madison, Mark, Mary, Mason, Matthew, Megan, Melissa, Michelle, Mike, Molly, Nancy, Nathan, Neil, Nick, Noah, Oliver, Olivia, Oscar, Owen, Paige, Patrick, Peggy, Peter, Phil, Poppy, Rachel, Ray, Rebecca, Riley, Rob, Robert, Robin, Rose, Ruby, Ryan, Sally, Sam, Samantha, Sandra, Sarah, Scarlett, Scott, Sean, Shannon, Sharon, Sophia, Stacy, Steve, Stuart, Susan, Taylor, Ted, Terry, Tiffany, Tim, Tommy, Tony, Tracy, Tyler, Victoria, Walter, Wayne, Wendy, William, Zoe
`;

/** Prénoms turcs. */
export const TURKISH_FIRST_NAMES = `
  Ahmet, Ali, Alp, Arda, Aslı, Ayla, Aylin, Aysel, Ayşe, Barış, Baran, Berk, Berkay, Berna, Beyza, Burak, Burcu, Can, Cansu, Cem, Cemal, Cengiz, Deniz, Derya, Doğan, Ebru, Ece, Efe, Elif, Emine, Emir, Emre, Enes, Erdem, Eren, Esra, Fatma, Ferhat, Furkan, Gizem, Gökhan, Gül, Hakan, Halil, Hande, Hasan, Hatice, Hülya, İbrahim, İrem, Kaan, Kemal, Kerem, Leyla, Mehmet, Melek, Melike, Meltem, Merve, Mert, Metin, Murat, Mustafa, Neslihan, Nur, Oğuz, Onur, Orhan, Osman, Özge, Ömer, Rabia, Recep, Selin, Serkan, Sevgi, Sibel, Sinan, Songül, Süleyman, Tolga, Tuğba, Tuncay, Ufuk, Umut, Volkan, Yağmur, Yasemin, Yavuz, Yiğit, Yusuf, Zehra, Zeki, Zeynep
`;

/** Prénoms d'Asie (Chine, Japon, Corée, Vietnam, Inde, Philippines…). */
export const ASIAN_FIRST_NAMES = `
  Aiko, Akira, Amit, Ananya, Anh, Arjun, Bao, Chen, Cheng, Daiki, Deepa, Dong, Duc, Haruki, Haruto, Hana, Hiro, Hiroshi, Hoa, Huong, Hyun, Ji-woo, Jin, Jiro, Jun, Kai, Kaito, Kavya, Kenji, Kim, Kiran, Kumiko, Lan, Lee, Li, Lian, Lin, Linh, Mai, Mei, Mi-rae, Min, Min-jun, Ming, Minh, Naoki, Naomi, Nguyen, Nobu, Priya, Rahul, Rajesh, Ravi, Ren, Riku, Rin, Sakura, Sanjay, Satoshi, Seo-yeon, Shiro, Shreya, Soo-ah, Sora, Sunil, Takashi, Takumi, Thanh, Tran, Tuan, Vijay, Wei, Xiao, Xin, Yan, Yi, Yoko, Yong, Young, Yu, Yuki, Yuna, Yuto, Zhang, Zhi
`;

/** Prénoms d'Afrique (Afrique de l'Ouest, centrale, de l'Est, australe…). */
export const AFRICAN_FIRST_NAMES = `
  Abdou, Abebe, Abiola, Aboubacar, Adama, Adebayo, Adjoa, Afia, Aïssatou, Akosua, Alassane, Alioune, Amara, Amadou, Amina, Aminata, Ayodele, Ayo, Babacar, Bamba, Binta, Boubou, Chidi, Chiamaka, Chinedu, Chioma, Cheikh, Coumba, Daouda, Demba, Désiré, Diarra, Dieynaba, Djeneba, Emeka, Eze, Fatou, Fatoumata, Fodé, Folake, Habib, Ibrahima, Idrissa, Ifeoma, Issa, Jabari, Kader, Kadiatou, Kalidou, Kandia, Kofi, Kouadio, Kouamé, Kwame, Kwabena, Lamine, Lassana, Mamadou, Mariam, Mariama, Massamba, Moussa, Mbaye, Ndeye, Ngozi, Nia, Nnamdi, Obinna, Oumar, Ousmane, Penda, Rokia, Sadio, Salif, Samba, Sekou, Seynabou, Sidiki, Souleymane, Tidiane, Thandiwe, Tunde, Wanjiru, Yaw, Yaya, Yemi, Zola, Zuri
`;

/** Prénoms latinos (Espagne, Portugal, Amérique latine, Brésil, Italie…). */
export const LATIN_FIRST_NAMES = `
  Adriana, Agustín, Alejandra, Alejandro, Alessandro, Alfonso, Alicia, Álvaro, Ana, Andrés, Antonio, Beatriz, Benito, Bruna, Camila, Carlos, Carmen, Catalina, Cristian, Cristina, Daniela, Diego, Dolores, Eduardo, Elena, Emilia, Enrique, Esteban, Fabiola, Felipe, Fernanda, Fernando, Francesca, Francisco, Gabriela, Gael, Gerardo, Gonzalo, Guadalupe, Guillermo, Gustavo, Ignacio, Inés, Isabel, Iván, Javier, Jesús, Joaquín, Jorge, José, Juan, Juana, Julieta, Leonardo, Lorena, Luis, Lucía, Luciana, Manuel, Marco, Marcos, María, Mariana, Martina, Mateo, Miguel, Natalia, Nicolás, Pablo, Paco, Paola, Pedro, Pilar, Rafael, Ramón, Raúl, Ricardo, Roberto, Rodrigo, Rosa, Salvador, Santiago, Sergio, Silvia, Sofía, Teresa, Tomás, Valentina, Valeria, Xavier, Ximena
`;
