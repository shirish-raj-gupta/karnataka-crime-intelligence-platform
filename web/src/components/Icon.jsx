// Icon wrapper backed by lucide-react.
//
// Keeps the existing <Icon name="..." size=.. /> API so every view that already
// uses it gets crisp, consistent lucide icons with zero changes. New names can
// be added to the MAP below.

import {
  LayoutDashboard, Map, BarChart3, TrendingUp, ShieldAlert, Network as NetworkIcon,
  Bot, Search, Bell, Mic, Download, Languages, Shield, LogOut, Clock, AlertTriangle,
  Banknote, Sparkles, FileText, ScatterChart, Activity, Users, Building2, MapPin,
  Brain, Volume2, Radar,
} from "lucide-react";

const MAP = {
  dashboard: LayoutDashboard,
  map: Map,
  patterns: BarChart3,
  trends: TrendingUp,
  risk: ShieldAlert,
  socio: ScatterChart,
  network: NetworkIcon,
  assistant: Bot,
  search: Search,
  bell: Bell,
  mic: Mic,
  download: Download,
  translate: Languages,
  shield: Shield,
  logout: LogOut,
  clock: Clock,
  alert: AlertTriangle,
  money: Banknote,
  spark: Sparkles,
  doc: FileText,
  activity: Activity,
  users: Users,
  building: Building2,
  pin: MapPin,
  brain: Brain,
  speak: Volume2,
  radar: Radar,
};

export default function Icon({ name, size = 18, stroke = 2, className = "", style, spin, pulse, animate }) {
  const Cmp = MAP[name];
  if (!Cmp) return null;
  const anim = spin ? "ic-spin" : pulse ? "ic-pulse" : animate ? "ic-anim" : "";
  return (
    <Cmp
      size={size}
      strokeWidth={stroke}
      className={`${anim} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  );
}
