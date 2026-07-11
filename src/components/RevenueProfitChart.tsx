"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const data = [
  { day: "Mon", revenue: 18000, profit: 5500 },
  { day: "Tue", revenue: 22000, profit: 7000 },
  { day: "Wed", revenue: 19500, profit: 6200 },
  { day: "Thu", revenue: 26000, profit: 8500 },
  { day: "Fri", revenue: 31000, profit: 10200 },
  { day: "Sat", revenue: 42000, profit: 12800 },
  { day: "Sun", revenue: 28000, profit: 9000 },
];

export default function RevenueProfitChart() {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="day" />
        <YAxis />
        <Tooltip />

        <Line
          type="monotone"
          dataKey="revenue"
          stroke="#22c55e"
          strokeWidth={3}
          name="Revenue"
        />

        <Line
          type="monotone"
          dataKey="profit"
          stroke="#3b82f6"
          strokeWidth={3}
          name="Profit"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}