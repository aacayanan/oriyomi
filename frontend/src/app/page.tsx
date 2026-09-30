import TextReader from "@/components/TextReader";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <div className="flex min-h-screen flex-1 flex-col">
        <TextReader />
      </div>
    </div>
  );
}
