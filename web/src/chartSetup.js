// Register Chart.js components once and set the dark-theme defaults.
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend
);

ChartJS.defaults.color = "#93a6c0";
ChartJS.defaults.borderColor = "rgba(42,56,80,0.6)";
ChartJS.defaults.font.family = '"Inter", "Segoe UI", system-ui, sans-serif';

// Global entrance animation for every chart (govt-grade, smooth).
ChartJS.defaults.animation = { duration: 850, easing: "easeOutQuart" };
ChartJS.defaults.animations = {
  numbers: { duration: 850, easing: "easeOutQuart" },
};
ChartJS.defaults.elements.bar.borderRadius = 6;
ChartJS.defaults.elements.bar.borderSkipped = false;
ChartJS.defaults.elements.line.tension = 0.35;
ChartJS.defaults.elements.line.borderWidth = 2.5;
ChartJS.defaults.elements.point.radius = 3;
ChartJS.defaults.elements.point.hoverRadius = 6;

// Themed tooltips everywhere.
ChartJS.defaults.plugins.tooltip.backgroundColor = "rgba(15,22,32,0.96)";
ChartJS.defaults.plugins.tooltip.borderColor = "#2a3850";
ChartJS.defaults.plugins.tooltip.borderWidth = 1;
ChartJS.defaults.plugins.tooltip.titleColor = "#eaf1fa";
ChartJS.defaults.plugins.tooltip.bodyColor = "#cdd9ea";
ChartJS.defaults.plugins.tooltip.padding = 11;
ChartJS.defaults.plugins.tooltip.cornerRadius = 10;
ChartJS.defaults.plugins.tooltip.boxPadding = 5;
ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
ChartJS.defaults.plugins.legend.labels.padding = 14;

export default ChartJS;
