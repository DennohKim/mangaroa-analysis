"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Slider } from '@/components/ui/slider';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Add type declarations
declare global {
  interface Window {
    fs: {
      readFile: (path: string, options: { encoding: string }) => Promise<string>;
    };
  }
}

// Process the actual Mangaroa canopy cover CSV data
const processRealCanopyCoverData = async () => {
  try {
    // Read the actual CSV file
    console.log('Attempting to read CSV file...');
    const response = await fetch('/data/mangaroa_sampling_zone_1_kanop_screening_25_m.csv');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV file: ${response.statusText}`);
    }
    
    const csvText = await response.text();
    
    if (!csvText) {
      throw new Error('No data received from file read');
    }
    
    console.log('File read successful. First 200 characters:', csvText.substring(0, 200));
    
    // Parse CSV using Papa Parse
    const Papa = await import('papaparse');
    const parsed = Papa.parse<Record<string, any>>(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      delimitersToGuess: [',', '\t', '|', ';']
    });

    console.log('Raw CSV data sample:', parsed.data.slice(0, 3));
    console.log('Total records:', parsed.data.length);
    
    // Process the data to match your structure
    const processedData = parsed.data.map((row: Record<string, any>, index) => {
      // Clean up column names (remove whitespace)
      const cleanRow: Record<string, any> = {};
      Object.keys(row).forEach(key => {
        const cleanKey = key.trim();
        cleanRow[cleanKey] = row[key];
      });

      return {
        id: `${cleanRow.x}_${cleanRow.y}_${cleanRow.year}`,
        pixel_id: index,
        x: parseFloat(cleanRow.x),
        y: parseFloat(cleanRow.y),
        year: parseInt(cleanRow.year),
        canopy_cover: parseFloat(cleanRow.canopy_cover) || 0,
        coordinates: [parseFloat(cleanRow.x), parseFloat(cleanRow.y)] as [number, number],
        tree_height: parseFloat(cleanRow.tree_height) || 0,
        living_biomass: parseFloat(cleanRow.living_biomass) || 0,
        carbon_stock: parseFloat(cleanRow.living_biomass_carbon_stock) || 0,
        diversity_index: parseFloat(cleanRow.raos_q_diversity_index) || 0
      };
    }).filter(row => 
      // Filter out invalid data
      !isNaN(row.x) && !isNaN(row.y) && !isNaN(row.year) && row.year >= 2013 && row.year <= 2024
    );

    // Create unique pixel IDs based on coordinates
    const pixelMap = new Map();
    let pixelCounter = 0;
    
    processedData.forEach(row => {
      const coordKey = `${row.x.toFixed(6)}_${row.y.toFixed(6)}`;
      if (!pixelMap.has(coordKey)) {
        pixelMap.set(coordKey, pixelCounter++);
      }
      row.pixel_id = pixelMap.get(coordKey);
    });

    console.log('Processed data summary:');
    console.log('- Total records:', processedData.length);
    console.log('- Unique pixels:', pixelMap.size);
    console.log('- Year range:', Math.min(...processedData.map(d => d.year)), 'to', Math.max(...processedData.map(d => d.year)));
    console.log('- Canopy cover range:', Math.min(...processedData.map(d => d.canopy_cover)), 'to', Math.max(...processedData.map(d => d.canopy_cover)));
    console.log('- Sample processed record:', processedData[0]);

    return processedData;
  } catch (error) {
    console.error('Error processing real canopy cover data:', error);
    
    // Fallback to mock data if file loading fails
    console.log('Falling back to mock data...');
    return generateMockData();
  }
};

// Fallback mock data generator
const generateMockData = () => {
  interface MockDataPoint {
    id: string;
    pixel_id: number;
    x: number;
    y: number;
    year: number;
    canopy_cover: number;
    coordinates: [number, number];
    tree_height: number;
    living_biomass: number;
    carbon_stock: number;
    diversity_index: number;
  }

  const mockData: MockDataPoint[] = [];
  const centerLat = -41.148613;
  const centerLng = 175.086901;
  const pixels = [];
  
  // Create 77 unique pixel locations
  for (let i = 0; i < 77; i++) {
    const latOffset = (Math.random() - 0.5) * 0.01;
    const lngOffset = (Math.random() - 0.5) * 0.01;
    pixels.push({
      id: i,
      x: centerLng + lngOffset,
      y: centerLat + latOffset
    });
  }
  
  // Generate 12 years of data for each pixel
  const years = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
  
  pixels.forEach(pixel => {
    years.forEach(year => {
      const baseCanopy = Math.random() * 100;
      const yearIndex = year - 2013;
      const trend = (Math.random() - 0.5) * 2;
      const canopyCover = Math.max(0, Math.min(100, baseCanopy + (trend * yearIndex)));
      
      mockData.push({
        id: `${pixel.id}_${year}`,
        pixel_id: pixel.id,
        x: pixel.x,
        y: pixel.y,
        year: year,
        canopy_cover: canopyCover,
        coordinates: [pixel.x, pixel.y],
        tree_height: Math.random() * 30,
        living_biomass: Math.random() * 200,
        carbon_stock: Math.random() * 50,
        diversity_index: Math.random()
      });
    });
  });
  
  return mockData;
};

const VISUALIZATION_MODES = {
  current_year: {
    label: 'Current Year View',
    description: 'Show canopy cover for selected year'
  },
  change_from_baseline: {
    label: 'Change from 2013',
    description: 'Show change since baseline (2013)'
  },
  trend_analysis: {
    label: 'Trend Analysis',
    description: 'Show overall trend (increase/decrease)'
  }
} as const;

type VisualizationMode = keyof typeof VISUALIZATION_MODES;

interface CanopyDataPoint {
  id: string;
  pixel_id: number;
  x: number;
  y: number;
  year: number;
  canopy_cover: number;
  coordinates: [number, number];
  tree_height: number;
  living_biomass: number;
  carbon_stock: number;
  diversity_index: number;
}

interface DataStats {
  totalRecords: number;
  uniquePixels: number;
  yearRange: [number, number];
  canopyRange: [number, number];
  avgCanopy: number;
}

interface PixelTrend {
  pixel_id: number;
  x: number;
  y: number;
  coordinates: [number, number];
  years: number[];
  values: number[];
}

interface SavedMapState {
  center: [number, number];
  zoom: number;
}

const CanopyCoverVisualizer = () => {
  const mapContainer = useRef(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedYear, setSelectedYear] = useState([2024]);
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>('current_year');
  const [opacity, setOpacity] = useState([80]);
  const [canopyData, setCanopyData] = useState<CanopyDataPoint[]>([]);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [loading, setLoading] = useState(true);
  const animationRef = useRef<NodeJS.Timeout | null>(null);

  const years = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

  // Initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    try {
      console.log('Initializing Mapbox map...');
      // Try to load saved map state
      const savedState = localStorage.getItem('mapState');
      let center: [number, number] = [175.086901, -41.148613]; // Default center for Mangaroa
      let zoom = 15;

      if (savedState) {
        try {
          const parsedState = JSON.parse(savedState) as SavedMapState;
          center = parsedState.center;
          zoom = parsedState.zoom;
        } catch (e) {
          console.error('Failed to parse saved map state:', e);
        }
      }

      // Set access token
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

      const mapInstance = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: center,
        zoom: zoom
      });

      map.current = mapInstance;

      // Add navigation controls
      mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');
      mapInstance.addControl(new mapboxgl.ScaleControl({
        maxWidth: 80,
        unit: 'metric'
      }), 'bottom-left');

      // Save map state when it changes
      const saveMapState = () => {
        if (!mapInstance) return;
        
        const state: SavedMapState = {
          center: mapInstance.getCenter().toArray() as [number, number],
          zoom: mapInstance.getZoom()
        };
        
        localStorage.setItem('mapState', JSON.stringify(state));
      };

      // Save state on moveend event
      mapInstance.on('moveend', saveMapState);

      mapInstance.on('load', async () => {
        console.log('Map loaded successfully');
        setIsLoaded(true);
        setLoading(true);
        
        try {
          const data = await processRealCanopyCoverData();
          setCanopyData(data);
          
          // Calculate data statistics
          const uniquePixels = new Set(data.map(d => d.pixel_id)).size;
          const uniqueYears = new Set(data.map(d => d.year));
          const canopyValues = data.map(d => d.canopy_cover).filter(v => !isNaN(v));
          
          setDataStats({
            totalRecords: data.length,
            uniquePixels: uniquePixels,
            yearRange: [Math.min(...uniqueYears), Math.max(...uniqueYears)],
            canopyRange: [Math.min(...canopyValues), Math.max(...canopyValues)],
            avgCanopy: canopyValues.reduce((a, b) => a + b, 0) / canopyValues.length
          });
          
        } catch (error) {
          console.error('Error loading canopy data:', error);
        } finally {
          setLoading(false);
        }
      });

      mapInstance.on('error', (e: { error: Error }) => {
        console.error('Mapbox error:', e.error);
      });

    } catch (error) {
      console.error('Error initializing map:', error);
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Process data based on visualization mode
  const processVisualizationData = () => {
    if (!canopyData.length) return [];

    const currentYear = selectedYear[0];
    
    switch (visualizationMode) {
      case 'current_year':
        return canopyData.filter(d => d.year === currentYear);
        
      case 'change_from_baseline':
        const baseline2013 = canopyData.filter(d => d.year === 2013);
        const currentYearData = canopyData.filter(d => d.year === currentYear);
        
        return currentYearData.map(current => {
          const baseline = baseline2013.find(b => b.pixel_id === current.pixel_id);
          return {
            ...current,
            change_value: current.canopy_cover - (baseline?.canopy_cover || 0),
            baseline_canopy: baseline?.canopy_cover || 0
          };
        });
        
      case 'trend_analysis':
        const pixelTrends: Record<number, PixelTrend> = {};
        
        // Calculate trend for each pixel
        canopyData.forEach(d => {
          if (!pixelTrends[d.pixel_id]) {
            pixelTrends[d.pixel_id] = { 
              pixel_id: d.pixel_id, 
              x: d.x, 
              y: d.y, 
              coordinates: d.coordinates,
              years: [], 
              values: [] 
            };
          }
          pixelTrends[d.pixel_id].years.push(d.year);
          pixelTrends[d.pixel_id].values.push(d.canopy_cover);
        });
        
        return Object.values(pixelTrends).map(trend => {
          // Simple linear trend calculation
          const n = trend.years.length;
          if (n < 2) return null;
          
          const sumX = trend.years.reduce((a, b) => a + b, 0);
          const sumY = trend.values.reduce((a, b) => a + b, 0);
          const sumXY = trend.years.reduce((sum, year, i) => sum + year * trend.values[i], 0);
          const sumXX = trend.years.reduce((sum, year) => sum + year * year, 0);
          
          const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
          const avgCanopy = sumY / n;
          
          return {
            ...trend,
            trend_slope: slope,
            avg_canopy: avgCanopy,
            canopy_cover: avgCanopy,
            trend_direction: slope > 0.5 ? 'increasing' : slope < -0.5 ? 'decreasing' : 'stable'
          };
        }).filter(Boolean);
        
      default:
        return canopyData.filter(d => d.year === currentYear);
    }
  };

  // Create GeoJSON for visualization
  const createVisualizationGeoJSON = () => {
    const data = processVisualizationData();
    
    const geoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: data.map(point => {
        if (!point) return null;
        const isCanopyDataPoint = 'year' in point;
        
        // Create a square polygon around the point (25m × 25m)
        const size = 0.00025; // increased from 0.000225 to eliminate gaps
        const [lng, lat] = point.coordinates;
        const square = [
          [lng - size/2, lat - size/2],
          [lng + size/2, lat - size/2],
          [lng + size/2, lat + size/2],
          [lng - size/2, lat + size/2],
          [lng - size/2, lat - size/2]
        ];

        const feature: GeoJSON.Feature = {
          type: 'Feature',
          properties: {
            pixel_id: point.pixel_id,
            year: isCanopyDataPoint ? point.year : selectedYear[0],
            canopy_cover: point.canopy_cover,
            change_value: isCanopyDataPoint ? 0 : (point as any).change_value || 0,
            baseline_canopy: isCanopyDataPoint ? 0 : (point as any).baseline_canopy || 0,
            trend_slope: isCanopyDataPoint ? 0 : (point as any).trend_slope || 0,
            trend_direction: isCanopyDataPoint ? 'stable' : (point as any).trend_direction || 'stable',
            avg_canopy: isCanopyDataPoint ? point.canopy_cover : (point as any).avg_canopy || point.canopy_cover,
            visualization_mode: visualizationMode,
            tree_height: isCanopyDataPoint ? point.tree_height : 0,
            living_biomass: isCanopyDataPoint ? point.living_biomass : 0,
            carbon_stock: isCanopyDataPoint ? point.carbon_stock : 0
          },
          geometry: {
            type: 'Polygon',
            coordinates: [square]
          }
        };
        return feature;
      }).filter((feature): feature is GeoJSON.Feature => feature !== null)
    };

    return geoJSON;
  };

  // Update map visualization
  useEffect(() => {
    if (!isLoaded || !canopyData.length || !map.current || loading) return;

    const geoJSON = createVisualizationGeoJSON();

    // Remove existing layers
    ['canopy-heatmap', 'canopy-points'].forEach(layerId => {
      if (map.current?.getLayer(layerId)) {
        map.current?.removeLayer(layerId);
      }
    });
    
    if (map.current.getSource('canopy-data')) {
      map.current.removeSource('canopy-data');
    }

    // Add new source
    map.current.addSource('canopy-data', {
      type: 'geojson',
      data: geoJSON
    });

    // Color expressions based on visualization mode
    let circleColor, heatmapWeight;
    
    switch (visualizationMode) {
      case 'current_year':
        circleColor = [
          'interpolate',
          ['linear'],
          ['get', 'canopy_cover'],
          0, '#ffffcc',    // Light yellow for low canopy
          25, '#a1dab4',   // Light green
          50, '#41b6c4',   // Teal
          75, '#2c7fb8',   // Blue
          100, '#253494'   // Dark blue for high canopy
        ] as mapboxgl.Expression;
        heatmapWeight = [
          'interpolate',
          ['linear'],
          ['get', 'canopy_cover'],
          0, 0,
          100, 1
        ] as mapboxgl.Expression;
        break;
        
      case 'change_from_baseline':
        circleColor = [
          'interpolate',
          ['linear'],
          ['get', 'change_value'],
          -50, '#d73027',  // Red for big decrease
          -25, '#fc8d59',  // Orange for decrease
          0, '#ffffbf',    // Yellow for no change
          25, '#91bfdb',   // Light blue for increase
          50, '#4575b4'    // Blue for big increase
        ] as mapboxgl.Expression;
        heatmapWeight = [
          'interpolate',
          ['linear'],
          ['abs', ['get', 'change_value']],
          0, 0,
          50, 1
        ] as mapboxgl.Expression;
        break;
        
      case 'trend_analysis':
        circleColor = [
          'case',
          ['==', ['get', 'trend_direction'], 'increasing'], '#2ca02c',
          ['==', ['get', 'trend_direction'], 'decreasing'], '#d62728',
          '#1f77b4'
        ] as mapboxgl.Expression;
        heatmapWeight = [
          'interpolate',
          ['linear'],
          ['abs', ['get', 'trend_slope']],
          0, 0,
          2, 1
        ] as mapboxgl.Expression;
        break;
        
      default:
        circleColor = ['literal', '#22c55e'] as mapboxgl.Expression;
        heatmapWeight = ['literal', 0.5] as mapboxgl.Expression;
    }

    // Add heatmap layer
    map.current.addLayer({
      id: 'canopy-heatmap',
      type: 'heatmap',
      source: 'canopy-data',
      maxzoom: 16,
      paint: {
        'heatmap-weight': heatmapWeight,
        'heatmap-intensity': 1,
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.2, 'rgba(34, 197, 94, 0.4)',
          0.4, 'rgba(34, 197, 94, 0.6)',
          0.6, 'rgba(34, 197, 94, 0.8)',
          1, 'rgba(34, 197, 94, 1)'
        ],
        'heatmap-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 2,
          16, 15
        ],
        'heatmap-opacity': opacity[0] / 100
      }
    });

    // Add circle layer for detailed view
    map.current.addLayer({
      id: 'canopy-points',
      type: 'fill',
      source: 'canopy-data',
      minzoom: 14,
      paint: {
        'fill-color': circleColor,
        'fill-outline-color': '#ffffff',
        'fill-opacity': opacity[0] / 100
      }
    });

    // Add click handler for detailed popups
    const handleClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features?.[0]?.properties) return;
      const props = e.features[0].properties;
      
      let popupContent = `
        <div style="padding: 12px; min-width: 250px; font-family: Arial, sans-serif;">
          <h3 style="font-weight: bold; margin-bottom: 8px; color: #2563eb;">Pixel ${props.pixel_id}</h3>
          <p style="margin: 2px 0;"><strong>Coordinates:</strong> ${e.lngLat.lng.toFixed(6)}, ${e.lngLat.lat.toFixed(6)}</p>
      `;
      
      if (visualizationMode === 'current_year') {
        popupContent += `
          <p style="margin: 2px 0;"><strong>Year:</strong> ${props.year}</p>
          <p style="margin: 2px 0;"><strong>Canopy Cover:</strong> ${props.canopy_cover.toFixed(2)}%</p>
          <p style="margin: 2px 0;"><strong>Tree Height:</strong> ${props.tree_height.toFixed(1)}m</p>
          <p style="margin: 2px 0;"><strong>Living Biomass:</strong> ${props.living_biomass.toFixed(1)} kg/m²</p>
        `;
      } else if (visualizationMode === 'change_from_baseline') {
        popupContent += `
          <p style="margin: 2px 0;"><strong>Current Year:</strong> ${props.year}</p>
          <p style="margin: 2px 0;"><strong>Current Canopy:</strong> ${props.canopy_cover.toFixed(2)}%</p>
          <p style="margin: 2px 0;"><strong>2013 Baseline:</strong> ${props.baseline_canopy.toFixed(2)}%</p>
          <p style="margin: 2px 0; color: ${props.change_value > 0 ? '#22c55e' : props.change_value < 0 ? '#ef4444' : '#6b7280'};"><strong>Change:</strong> ${props.change_value > 0 ? '+' : ''}${props.change_value.toFixed(2)}%</p>
        `;
      } else if (visualizationMode === 'trend_analysis') {
        popupContent += `
          <p style="margin: 2px 0;"><strong>12-Year Trend:</strong> <span style="color: ${props.trend_direction === 'increasing' ? '#22c55e' : props.trend_direction === 'decreasing' ? '#ef4444' : '#6b7280'}">${props.trend_direction}</span></p>
          <p style="margin: 2px 0;"><strong>Avg Canopy:</strong> ${props.avg_canopy.toFixed(2)}%</p>
          <p style="margin: 2px 0;"><strong>Annual Change:</strong> ${props.trend_slope > 0 ? '+' : ''}${props.trend_slope.toFixed(3)}%/year</p>
        `;
      }
      
      popupContent += '</div>';
      
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(popupContent)
        .addTo(map.current as mapboxgl.Map);
    };

    map.current.off('click', 'canopy-points' as any);
    map.current.on('click', 'canopy-points' as any, handleClick);

    // Cursor handling
    const handleMouseEnter = () => {
      if (!map.current) return;
      map.current.getCanvas().style.cursor = 'pointer';
    };

    const handleMouseLeave = () => {
      if (!map.current) return;
      map.current.getCanvas().style.cursor = '';
    };

    map.current.on('mouseenter', 'canopy-points' as any, handleMouseEnter);
    map.current.on('mouseleave', 'canopy-points' as any, handleMouseLeave);

  }, [selectedYear, visualizationMode, opacity, isLoaded, canopyData, loading]);

  // Animation controls
  const startAnimation = () => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    let currentYearIndex = 0;
    
    const animate = () => {
      if (currentYearIndex < years.length) {
        setSelectedYear([years[currentYearIndex]]);
        currentYearIndex++;
        animationRef.current = setTimeout(animate, 1000); // 1 second per year
      } else {
        setIsAnimating(false);
      }
    };
    
    animate();
  };

  const stopAnimation = () => {
    if (animationRef.current) {
      clearTimeout(animationRef.current);
    }
    setIsAnimating(false);
  };

  return (
    <div className="w-full h-screen relative">
      {/* Control Panel */}
      <div className="absolute top-4 left-4 z-10 bg-white p-4 rounded-lg shadow-lg min-w-96 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4 text-gray-800">Mangaroa Canopy Cover Analysis</h2>
        
        {/* Data Status */}
        {dataStats && (
          <div className="mb-4 p-3 bg-green-50 rounded border border-green-200">
            <h3 className="font-semibold text-green-800 mb-2">Real Data Loaded ✓</h3>
            <div className="text-xs text-green-700">
              <p>• {dataStats.totalRecords} total records</p>
              <p>• {dataStats.uniquePixels} unique pixels</p>
              <p>• Years: {dataStats.yearRange[0]} - {dataStats.yearRange[1]}</p>
              <p>• Canopy range: {dataStats.canopyRange[0].toFixed(1)}% - {dataStats.canopyRange[1].toFixed(1)}%</p>
              <p>• Average canopy: {dataStats.avgCanopy.toFixed(1)}%</p>
            </div>
          </div>
        )}
        
        {/* Visualization Mode */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-gray-700">Visualization Mode</label>
          <select 
            value={visualizationMode}
            onChange={(e) => setVisualizationMode(e.target.value as VisualizationMode)}
            className="w-full p-2 bg-white border border-gray-300 rounded text-gray-800"
          >
            {Object.entries(VISUALIZATION_MODES).map(([key, mode]) => (
              <option key={key} value={key}>
                {mode.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {VISUALIZATION_MODES[visualizationMode].description}
          </p>
        </div>

        {/* Year Selection */}
        {visualizationMode !== 'trend_analysis' && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-gray-700">
              Year: {selectedYear[0]}
            </label>
            <Slider
              value={selectedYear}
              onValueChange={setSelectedYear}
              min={2013}
              max={2024}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>2013</span>
              <span>2024</span>
            </div>
          </div>
        )}

        {/* Animation Controls */}
        {/* {visualizationMode !== 'trend_analysis' && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-gray-700">Timeline Animation</label>
            <div className="flex gap-2">
              <button
                onClick={startAnimation}
                disabled={isAnimating}
                className="flex-1 bg-green-500 text-white px-3 py-2 rounded hover:bg-green-600 transition-colors disabled:bg-gray-400"
              >
                {isAnimating ? 'Playing...' : 'Play Timeline'}
              </button>
              <button
                onClick={stopAnimation}
                disabled={!isAnimating}
                className="flex-1 bg-red-500 text-white px-3 py-2 rounded hover:bg-red-600 transition-colors disabled:bg-gray-400"
              >
                Stop
              </button>
            </div>
          </div>
        )} */}

        {/* Opacity Control */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-gray-700">
            Opacity: {opacity[0]}%
          </label>
          <Slider
            value={opacity}
            onValueChange={setOpacity}
            max={100}
            min={10}
            step={5}
            className="w-full"
          />
        </div>

        {/* Legend */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-gray-700">Legend</label>
          <div className="space-y-1">
            {visualizationMode === 'current_year' && (
              <>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ffffcc' }}></div>
                  <span className="text-xs">Low Canopy (0-25%)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#a1dab4' }}></div>
                  <span className="text-xs">Medium-Low (25-50%)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#41b6c4' }}></div>
                  <span className="text-xs">Medium (50-75%)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#2c7fb8' }}></div>
                  <span className="text-xs">High (75-90%)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#253494' }}></div>
                  <span className="text-xs">Very High (90-100%)</span>
                </div>
              </>
            )}
            {visualizationMode === 'change_from_baseline' && (
              <>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#d73027' }}></div>
                  <span className="text-xs">Large Decrease (&lt;-25%)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#fc8d59' }}></div>
                  <span className="text-xs">Moderate Decrease (-25% to 0%)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ffffbf' }}></div>
                  <span className="text-xs">No Change (0%)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#91bfdb' }}></div>
                  <span className="text-xs">Moderate Increase (0% to 25%)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#4575b4' }}></div>
                  <span className="text-xs">Large Increase (&gt;25%)</span>
                </div>
              </>
            )}
            {visualizationMode === 'trend_analysis' && (
              <>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#2ca02c' }}></div>
                  <span className="text-xs">Increasing Trend (&gt;+0.5%/year)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#1f77b4' }}></div>
                  <span className="text-xs">Stable (-0.5% to +0.5%/year)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#d62728' }}></div>
                  <span className="text-xs">Decreasing Trend (&lt;-0.5%/year)</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-gray-700">Quick Actions</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setVisualizationMode('current_year');
                setSelectedYear([2013]);
              }}
              className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
            >
              View 2013
            </button>
            <button
              onClick={() => {
                setVisualizationMode('current_year');
                setSelectedYear([2024]);
              }}
              className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
            >
              View 2024
            </button>
            <button
              onClick={() => {
                setVisualizationMode('change_from_baseline');
                setSelectedYear([2024]);
              }}
              className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded hover:bg-orange-200"
            >
              12-Year Change
            </button>
            <button
              onClick={() => setVisualizationMode('trend_analysis')}
              className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded hover:bg-green-200"
            >
              Trend Analysis
            </button>
          </div>
        </div>

        {/* Data Quality Info */}
        <div className="text-xs text-gray-500 border-t pt-2">
          <p><strong>Data Structure:</strong></p>
          <p>• Time-series: 2013-2024 (12 years)</p>
          <p>• Spatial resolution: 25m × 25m pixels</p>
          <p>• Location: Mangaroa Zone 1, New Zealand</p>
          <p>• Coordinate system: WGS84 (EPSG:4326)</p>
          <p className="mt-2"><strong>Interaction:</strong></p>
          <p>• Click pixels for detailed info</p>
          <p>• Zoom in for individual pixel view</p>
          <p>• Use animation to see changes over time</p>
        </div>
      </div>

      {/* Map Container */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Loading Overlay */}
      {(!isLoaded || loading) && (
        <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-20">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4 mx-auto"></div>
            <p>{!isLoaded ? 'Loading Mapbox...' : 'Processing Canopy Cover Data...'}</p>
            <p className="text-sm text-gray-300 mt-2">
              {loading ? 'Reading CSV file and calculating statistics...' : 'Initializing map visualization...'}
            </p>
          </div>
        </div>
      )}

      {/* Bottom Info Panel */}
      <div className="absolute bottom-4 right-4 bg-white bg-opacity-95 p-3 rounded-lg shadow-lg">
        <div className="text-xs text-gray-600">
          <p className="font-medium">Canopy Cover Analysis</p>
          <p>{VISUALIZATION_MODES[visualizationMode].label}</p>
          {visualizationMode !== 'trend_analysis' && <p>Year: {selectedYear[0]}</p>}
          {isAnimating && <p className="text-green-600">▶ Animating timeline...</p>}
          {dataStats && (
            <p className="mt-1 text-green-600">
              ✓ Real data: {dataStats.totalRecords} records
            </p>
          )}
        </div>
      </div>

      {/* Error Handler */}
      {!loading && canopyData.length === 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-30">
          <p className="font-bold">Data Loading Error</p>
          <p>Could not load canopy cover data. Please check the CSV file.</p>
        </div>
      )}
    </div>
  );
};

export default CanopyCoverVisualizer;