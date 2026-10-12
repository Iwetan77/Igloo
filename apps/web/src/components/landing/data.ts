import {
  Bitcoin,
  Car,
  Clapperboard,
  CloudRain,
  Croissant,
  FlaskConical,
  Film,
  Gamepad2,
  Globe,
  Landmark,
  Mic,
  Pizza,
  Snowflake,
  Sparkles,
  Sprout,
  Telescope,
  TrendingUp,
  Trophy,
  Tv,
  type LucideIcon,
} from "lucide-react";

/** Where every "Open Igloo" button goes: the app's feed. */
export const APP_HREF = "/feed";

// Invented examples for the landing page only. Never real market data or prices.

export type LandingMarket = {
  question: string;
  handle: string;
  icon: LucideIcon;
  initial: string;
  /** YES price, 0–1 */
  price: number;
  ends: string;
  category: string;
  categoryColor: string;
  /** OKLCH hue for the image tile */
  hue: number;
};

export const LANDING_MARKETS: LandingMarket[] = [
  { question: "Will the group chat trip actually happen?", handle: "maya.k", icon: Car, initial: "M", price: 0.34, ends: "Ends in 3d", category: "Pop Culture", categoryColor: "#E879F9", hue: 320 },
  { question: "Will pineapple pizza make the top 5 this year?", handle: "slicetheory", icon: Pizza, initial: "S", price: 0.41, ends: "Ends in 6d", category: "Entertainment", categoryColor: "#F472B6", hue: 35 },
  { question: "Will it rain at Saturday's match?", handle: "groundsman", icon: CloudRain, initial: "G", price: 0.62, ends: "Ends in 3d", category: "Weather", categoryColor: "#38BDF8", hue: 225 },
  { question: "Will I finish the season before the finale airs?", handle: "couchmode", icon: Tv, initial: "C", price: 0.27, ends: "Ends in 9d", category: "Entertainment", categoryColor: "#F472B6", hue: 280 },
  { question: "Will this take age well?", handle: "hotornot", icon: Mic, initial: "H", price: 0.5, ends: "Ends in 2d", category: "Other", categoryColor: "#5f6c80", hue: 190 },
  { question: "Will the office plant survive the holidays?", handle: "deskjungle", icon: Sprout, initial: "D", price: 0.66, ends: "Ends in 12d", category: "Other", categoryColor: "#5f6c80", hue: 150 },
  { question: "Will the underdogs make the playoffs?", handle: "benchtalk", icon: Trophy, initial: "B", price: 0.22, ends: "Ends in 5d", category: "Sports", categoryColor: "#4ADE80", hue: 140 },
  { question: "Will the sequel beat the original's opening weekend?", handle: "popcornpolls", icon: Clapperboard, initial: "P", price: 0.45, ends: "Ends in 8d", category: "Entertainment", categoryColor: "#F472B6", hue: 10 },
  { question: "Will the new console sell out on launch day?", handle: "lagfree", icon: Gamepad2, initial: "L", price: 0.71, ends: "Ends in 4d", category: "Gaming", categoryColor: "#A78BFA", hue: 265 },
  { question: "Will it snow before December?", handle: "frostwatch", icon: Snowflake, initial: "F", price: 0.38, ends: "Ends in 7d", category: "Weather", categoryColor: "#38BDF8", hue: 205 },
  { question: "Will my sourdough starter survive the week?", handle: "crumbshot", icon: Croissant, initial: "C", price: 0.57, ends: "Ends in 6d", category: "Other", categoryColor: "#5f6c80", hue: 55 },
  { question: "Will the comet be visible from the city?", handle: "nightsky", icon: Telescope, initial: "N", price: 0.31, ends: "Ends in 10d", category: "Science", categoryColor: "#22D3EE", hue: 240 },
];

export type LandingTile = {
  name: string;
  color: string;
  icon: LucideIcon;
  /** Desktop position (% of section) and rotation (deg) */
  x: number;
  y: number;
  r: number;
  /** Position on small screens, for the 6 tiles shown there */
  mobile?: { x: number; y: number; r: number };
};

// Same icons as the app's category chips (components/category-icon.tsx).
export const LANDING_TILES: LandingTile[] = [
  { name: "Crypto", color: "#F7931A", icon: Bitcoin, x: 9, y: 10, r: -9, mobile: { x: 18, y: 12, r: -9 } },
  { name: "Sports", color: "#4ADE80", icon: Trophy, x: 30, y: 18, r: 6, mobile: { x: 80, y: 10, r: 7 } },
  { name: "Politics", color: "#F87171", icon: Landmark, x: 66, y: 14, r: -5, mobile: { x: 50, y: 18, r: -3 } },
  { name: "Entertainment", color: "#F472B6", icon: Film, x: 88, y: 12, r: 8 },
  { name: "Gaming", color: "#A78BFA", icon: Gamepad2, x: 6, y: 56, r: 7 },
  { name: "Science", color: "#22D3EE", icon: FlaskConical, x: 22, y: 80, r: -6 },
  { name: "Weather", color: "#38BDF8", icon: CloudRain, x: 74, y: 78, r: 5, mobile: { x: 18, y: 86, r: 6 } },
  { name: "Finance", color: "#34D399", icon: TrendingUp, x: 93, y: 54, r: -9, mobile: { x: 82, y: 88, r: -7 } },
  { name: "Pop Culture", color: "#E879F9", icon: Sparkles, x: 42, y: 84, r: 4, mobile: { x: 50, y: 82, r: 4 } },
  { name: "World", color: "#FCD34D", icon: Globe, x: 58, y: 80, r: -4 },
];
