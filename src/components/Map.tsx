'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Replace with your Mapbox access token
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface MapProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  polygonData?: {
    coordinates: number[][][];
    type: 'Polygon';
  };
}

interface SavedMapState {
  center: [number, number];
  zoom: number;
}

export default function Map({ 
  initialCenter = [-74.5, 40], // Default center (New York area)
  initialZoom = 9,
  polygonData
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (map.current) return; // initialize map only once
    if (!mapContainer.current) return;

    // Try to load saved map state
    const savedState = localStorage.getItem('mapState');
    let center = initialCenter;
    let zoom = initialZoom;

    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState) as SavedMapState;
        center = parsedState.center;
        zoom = parsedState.zoom;
      } catch (e) {
        console.error('Failed to parse saved map state:', e);
      }
    }

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: center,
      zoom: zoom
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Save map state when it changes
    const saveMapState = () => {
      if (!map.current) return;
      
      const state: SavedMapState = {
        center: map.current.getCenter().toArray() as [number, number],
        zoom: map.current.getZoom()
      };
      
      localStorage.setItem('mapState', JSON.stringify(state));
    };

    // Save state on moveend event
    map.current.on('moveend', saveMapState);

    // Cleanup on unmount
    return () => {
      map.current?.off('moveend', saveMapState);
      map.current?.remove();
    };
  }, [initialCenter, initialZoom]);

  // Add polygon when polygonData changes
  useEffect(() => {
    if (!map.current || !polygonData) return;

    const addPolygon = () => {
      // Remove existing polygon layer and source if they exist
      if (map.current?.getLayer('polygon-layer')) {
        map.current.removeLayer('polygon-layer');
      }
      if (map.current?.getSource('polygon-source')) {
        map.current.removeSource('polygon-source');
      }

      // Add the polygon source
      map.current?.addSource('polygon-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: polygonData,
          properties: {}
        }
      });

      // Add the polygon layer
      map.current?.addLayer({
        id: 'polygon-layer',
        type: 'fill',
        source: 'polygon-source',
        layout: {},
        paint: {
          'fill-color': '#0080ff',
          'fill-opacity': 0.5,
          'fill-outline-color': '#000000'
        }
      });
    };

    // If the map is already loaded, add the polygon immediately
    if (map.current.loaded()) {
      addPolygon();
    } else {
      // Otherwise, wait for the map to load
      map.current.on('load', addPolygon);
    }

    // Cleanup
    return () => {
      map.current?.off('load', addPolygon);
    };
  }, [polygonData]);

  return (
    <div 
      ref={mapContainer} 
      className="w-full h-screen rounded-lg shadow-lg"
    />
  );
} 