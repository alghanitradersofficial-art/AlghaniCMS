import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CalculatorPage() {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const append = (s: string) => setExpr((e) => e + s);
  const clearAll = () => { setExpr(""); setResult(null); };
  const back = () => setExpr((e) => e.slice(0, -1));
  const evaluate = () => {
    try {
      // safe eval: allow digits and +-*/(). and spaces only
      if (!/^[0-9+\-*/(). %]+$/.test(expr)) throw new Error("Invalid characters");
      // eslint-disable-next-line no-eval
      const val = eval(expr.replace(/%/g, "/100"));
      setResult(String(val));
    } catch (e: any) {
      setResult("ERR");
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Calculator</h1>
        </div>

        <Card>
          <CardContent>
            <div className="grid grid-cols-1 gap-4">
              <Input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="Enter expression" />
              <div className="text-right text-lg font-semibold">{result !== null ? result : ""}</div>
              <div className="grid grid-cols-4 gap-2">
                {['7','8','9','/','4','5','6','*','1','2','3','-','0','.','%','+'].map((b) => (
                  <Button key={b} onClick={() => append(b)}>{b}</Button>
                ))}
                <Button onClick={back}>⌫</Button>
                <Button onClick={clearAll}>C</Button>
                <Button className="col-span-2" onClick={evaluate}>=</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
