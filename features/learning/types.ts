export type LearningCategory = "Crops" | "Diseases" | "Pests" | "Nutrient deficiencies" | "Prevention" | "Weather";
export interface LearningArticle { id:string; slug:string; title:string; summary:string; category:LearningCategory; crop?:string; readMinutes:number; level:"Beginner"|"Intermediate"; featured?:boolean; }
