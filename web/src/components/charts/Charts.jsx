import { Bar, Line, Doughnut, Scatter } from "react-chartjs-2";
import {
  baseOptions, noLegend, horizontalBar, lineOptions, doughnutOptions, scatterOptions,
} from "./chartOptions";

// Thin wrappers that apply the shared animated/themed presets and a consistent
// height container. Pass `data` and optional `options` to override.

function Wrap({ height = 300, children }) {
  return <div className="chart-wrap" style={{ height }}>{children}</div>;
}

export function BarChart({ data, horizontal = false, height = 300, options = {} }) {
  return <Wrap height={height}><Bar data={data} options={{ ...(horizontal ? horizontalBar : noLegend), ...options }} /></Wrap>;
}

export function LineChart({ data, height = 300, options = {} }) {
  return <Wrap height={height}><Line data={data} options={{ ...lineOptions, ...options }} /></Wrap>;
}

export function DoughnutChart({ data, height = 300, options = {} }) {
  return <Wrap height={height}><Doughnut data={data} options={{ ...doughnutOptions, ...options }} /></Wrap>;
}

export function ScatterChart({ data, height = 300, options = {} }) {
  return <Wrap height={height}><Scatter data={data} options={{ ...scatterOptions, ...options }} /></Wrap>;
}

export { baseOptions, noLegend, horizontalBar, lineOptions, doughnutOptions, scatterOptions };
