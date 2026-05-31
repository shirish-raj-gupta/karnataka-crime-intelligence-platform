// Shared Chart.js option presets with smooth entrance animations + govt-grade
// theming. Import and spread into a chart's `options`.

const ANIM = {
  duration: 850,
  easing: "easeOutQuart",
};

const GRID = { color: "rgba(42,56,80,0.5)" };
const TICKS = { color: "#93a6c0", font: { size: 11 } };

export const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: ANIM,
  animations: {
    tension: { duration: 1000, easing: "easeOutQuart", from: 0.2, to: 0.35, loop: false },
  },
  plugins: {
    legend: { labels: { color: "#93a6c0", usePointStyle: true, pointStyleWidth: 10, padding: 14 } },
    tooltip: {
      backgroundColor: "rgba(15,22,32,0.95)",
      borderColor: "#2a3850",
      borderWidth: 1,
      titleColor: "#eaf1fa",
      bodyColor: "#cdd9ea",
      padding: 11,
      cornerRadius: 10,
      displayColors: true,
      boxPadding: 5,
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: TICKS },
    y: { grid: GRID, ticks: TICKS, beginAtZero: true },
  },
};

export const noLegend = {
  ...baseOptions,
  plugins: { ...baseOptions.plugins, legend: { display: false } },
};

export const horizontalBar = {
  ...noLegend,
  indexAxis: "y",
  scales: {
    x: { grid: GRID, ticks: TICKS, beginAtZero: true },
    y: { grid: { display: false }, ticks: { ...TICKS, font: { size: 10 } } },
  },
};

export const lineOptions = {
  ...baseOptions,
  plugins: { ...baseOptions.plugins, legend: { ...baseOptions.plugins.legend, position: "bottom" } },
  elements: { line: { borderWidth: 2.5 }, point: { hoverRadius: 6 } },
};

export const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { animateRotate: true, animateScale: true, duration: 900, easing: "easeOutQuart" },
  cutout: "62%",
  plugins: {
    legend: { position: "bottom", labels: { color: "#93a6c0", usePointStyle: true, padding: 14 } },
    tooltip: baseOptions.plugins.tooltip,
  },
};

export const scatterOptions = {
  ...baseOptions,
  plugins: { ...baseOptions.plugins, legend: { display: false } },
};
