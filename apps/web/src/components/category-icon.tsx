import { Bitcoin, Briefcase, CandlestickChart, CloudRain, Film, FlaskConical, Gamepad2, Gem, Globe, Landmark, LineChart, Sparkles, Star, TrendingUp, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const icons: Record<string, LucideIcon> = {
  bitcoin: Bitcoin,
  briefcase: Briefcase,
  "candlestick-chart": CandlestickChart,
  "cloud-rain": CloudRain,
  film: Film,
  "flask-conical": FlaskConical,
  "gamepad-2": Gamepad2,
  gem: Gem,
  globe: Globe,
  landmark: Landmark,
  "line-chart": LineChart,
  sparkles: Sparkles,
  star: Star,
  "trending-up": TrendingUp,
  trophy: Trophy,
};

export function CategoryIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = icons[name] || Sparkles;
  return <Icon size={size} aria-hidden="true" />;
}
