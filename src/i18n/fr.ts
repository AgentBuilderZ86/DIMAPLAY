const fr = {
  appName: 'Dima Play',
  tabs: {
    home: 'Accueil',
    play: 'Jouer',
    film: 'Filmer',
    ranking: 'Classement',
    profile: 'Profil',
  },
  empty: {
    home: {
      title: 'Les moments de ton quartier',
      body: 'Tes clips et ceux de tes coéquipiers apparaîtront ici.',
    },
    play: { title: 'Jouer', body: 'Yallah ! Les matchs ouverts près de toi arriveront ici.' },
    film: {
      title: 'Filmer ton match',
      body: 'Pose ton téléphone, lance l’enregistrement et marque les moments forts.',
    },
    ranking: {
      title: 'Classement',
      body: 'Quartier, ville, Maroc : ton rang s’affichera après ton premier match.',
    },
    profile: { title: 'Ta carte', body: 'Ta carte de joueur se construit match après match.' },
  },
};

export default fr;
export type Translation = typeof fr;
