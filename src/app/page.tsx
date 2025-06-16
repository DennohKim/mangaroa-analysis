import Image from "next/image";
import Map from "../components/Map";
import CanopyCoverVisualizer from "@/components/CanopyCoverVisualizer";

export default function Home() {
  return (
    <div className="">
      <main className="w-full h-full ">
        {/* <Map 
        polygonData={{
          type: 'Polygon',
          coordinates: [
            [
              [175.0872760438407, -41.15123827188798],
              [175.0872760438407, -41.15148827188798],
              [175.0875260438407, -41.15148827188798],
              [175.0875260438407, -41.15123827188798],
              [175.0872760438407, -41.15123827188798]
            ]
          ]
        }}
        /> */}
        <CanopyCoverVisualizer />
      </main>
    </div>
  );
}
