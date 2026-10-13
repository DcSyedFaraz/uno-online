import { Room } from "@/ui/Room";

export default async function RoomPage({ params }: PageProps<"/r/[code]">) {
  const { code } = await params;
  return <Room code={code.toUpperCase()} />;
}
