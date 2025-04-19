interface RankData {
    name: 'monthly' | 'creation' | 'lifetime';
    position: number;
    points: number;
    trophies: number;
}

export interface UserPosition {
    ranks: [
        RankData, // monthly
        RankData, // creation
        RankData  // lifetime
    ];
    totalTrophies: number;
    totalPoints: number;
}
