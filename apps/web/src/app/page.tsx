import { Landing } from "@/components/landing/landing";
import { HomeGateway } from "@/components/home-gateway";

export default function Home() {
  return <HomeGateway landing={<Landing />} />;
}

