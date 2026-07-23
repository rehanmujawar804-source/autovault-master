"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { name: "Cash", value: 18000 },
  { name: "UPI", value: 20500 },
  { name: "Card", value: 4000 },
];

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b"];

export default function PaymentSplitChart() {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            innerRadius={60}
            outerRadius={90}
            dataKey="value"
            paddingAngle={4}
          >
            {data.map((_, index) => (
              <Cell
                key={index}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>

          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}