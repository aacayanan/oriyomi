import { Suspense } from "react";
import TextReader from "@/components/TextReader";

export default function AppPage() {
  return (
    <div className="h-full overflow-hidden">
      <Suspense fallback={null}>
        <TextReader />
      </Suspense>
    </div>
  );
}
