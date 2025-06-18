"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Slider } from '@/components/ui/slider';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from 'recharts';

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
    description: 'Show selected metric for the chosen year'
  },
  change_from_baseline: {
    label: 'Change from 2013',
    description: 'Show change since baseline (2013)'
  },
  trend_analysis: {
    label: 'Trend Analysis',
    description: 'Show overall trend (increase/decrease)'
  },
  correlation: {
    label: 'Correlation Analysis',
    description: 'Show relationships between metrics'
  }
} as const;

const METRICS = {
  canopy_cover: {
    label: 'Canopy Cover',
    unit: '%',
    colorScale: [
      { value: 0, color: '#ffffcc' },
      { value: 25, color: '#a1dab4' },
      { value: 50, color: '#41b6c4' },
      { value: 75, color: '#2c7fb8' },
      { value: 100, color: '#253494' }
    ],
    changeColorScale: [
      { value: -50, color: '#d73027' },
      { value: -25, color: '#fc8d59' },
      { value: 0, color: '#ffffbf' },
      { value: 25, color: '#91bfdb' },
      { value: 50, color: '#4575b4' }
    ]
  },
  tree_height: {
    label: 'Tree Height',
    unit: 'm',
    colorScale: [
      { value: 0, color: '#ffffcc' },
      { value: 10, color: '#a1dab4' },
      { value: 20, color: '#41b6c4' },
      { value: 30, color: '#2c7fb8' },
      { value: 40, color: '#253494' }
    ],
    changeColorScale: [
      { value: -20, color: '#d73027' },
      { value: -10, color: '#fc8d59' },
      { value: 0, color: '#ffffbf' },
      { value: 10, color: '#91bfdb' },
      { value: 20, color: '#4575b4' }
    ]
  },
  living_biomass: {
    label: 'Living Biomass',
    unit: 'kg/m²',
    colorScale: [
      { value: 0, color: '#ffffcc' },
      { value: 50, color: '#a1dab4' },
      { value: 100, color: '#41b6c4' },
      { value: 150, color: '#2c7fb8' },
      { value: 200, color: '#253494' }
    ],
    changeColorScale: [
      { value: -100, color: '#d73027' },
      { value: -50, color: '#fc8d59' },
      { value: 0, color: '#ffffbf' },
      { value: 50, color: '#91bfdb' },
      { value: 100, color: '#4575b4' }
    ]
  },
  carbon_stock: {
    label: 'Carbon Stock',
    unit: 'kg/m²',
    colorScale: [
      { value: 0, color: '#ffffcc' },
      { value: 12.5, color: '#a1dab4' },
      { value: 25, color: '#41b6c4' },
      { value: 37.5, color: '#2c7fb8' },
      { value: 50, color: '#253494' }
    ],
    changeColorScale: [
      { value: -25, color: '#d73027' },
      { value: -12.5, color: '#fc8d59' },
      { value: 0, color: '#ffffbf' },
      { value: 12.5, color: '#91bfdb' },
      { value: 25, color: '#4575b4' }
    ]
  },
  diversity_index: {
    label: 'Diversity Index',
    unit: '',
    colorScale: [
      { value: 0, color: '#ffffcc' },
      { value: 0.25, color: '#a1dab4' },
      { value: 0.5, color: '#41b6c4' },
      { value: 0.75, color: '#2c7fb8' },
      { value: 1, color: '#253494' }
    ],
    changeColorScale: [
      { value: -0.5, color: '#d73027' },
      { value: -0.25, color: '#fc8d59' },
      { value: 0, color: '#ffffbf' },
      { value: 0.25, color: '#91bfdb' },
      { value: 0.5, color: '#4575b4' }
    ]
  }
} as const;

type VisualizationMode = keyof typeof VISUALIZATION_MODES;
type Metric = keyof typeof METRICS;

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
  trend_slope: number;
  avg_value: number;
  trend_direction: string;
  [key: string]: number | string | [number, number] | number[]; // Allow dynamic metric properties
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
  const [selectedMetric, setSelectedMetric] = useState<Metric>('canopy_cover');
  const [opacity, setOpacity] = useState([80]);
  const [canopyData, setCanopyData] = useState<CanopyDataPoint[]>([]);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [loading, setLoading] = useState(true);
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedYearForCorrelation, setSelectedYearForCorrelation] = useState(2024);
  const [selectedMetricsForCorrelation, setSelectedMetricsForCorrelation] = useState<[Metric, Metric]>(['canopy_cover', 'tree_height']);

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
            change_value: current[selectedMetric] - (baseline?.[selectedMetric] || 0),
            baseline_value: baseline?.[selectedMetric] || 0
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
              values: [], 
              trend_slope: 0,
              avg_value: 0,
              trend_direction: 'stable'
            };
          }
          pixelTrends[d.pixel_id].years.push(d.year);
          pixelTrends[d.pixel_id].values.push(d[selectedMetric]);
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
          const avgValue = sumY / n;
          
          const result: PixelTrend = {
            ...trend,
            trend_slope: slope,
            avg_value: avgValue,
            trend_direction: slope > 0.5 ? 'increasing' : slope < -0.5 ? 'decreasing' : 'stable'
          };
          result[selectedMetric] = avgValue;
          return result;
        }).filter((trend): trend is PixelTrend => trend !== null);
        
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
            [selectedMetric]: isCanopyDataPoint ? point[selectedMetric] : (point as any)[selectedMetric] || 0,
            change_value: isCanopyDataPoint ? 0 : (point as any).change_value || 0,
            baseline_value: isCanopyDataPoint ? 0 : (point as any).baseline_value || 0,
            trend_slope: isCanopyDataPoint ? 0 : (point as any).trend_slope || 0,
            trend_direction: isCanopyDataPoint ? 'stable' : (point as any).trend_direction || 'stable',
            avg_value: isCanopyDataPoint ? point[selectedMetric] : (point as any).avg_value || point[selectedMetric],
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

    // Color expressions based on visualization mode and selected metric
    let circleColor, heatmapWeight;
    const metric = METRICS[selectedMetric];
    
    switch (visualizationMode) {
      case 'current_year':
        circleColor = [
          'interpolate',
          ['linear'],
          ['get', selectedMetric],
          ...metric.colorScale.flatMap(scale => [scale.value, scale.color])
        ] as mapboxgl.Expression;
        heatmapWeight = [
          'interpolate',
          ['linear'],
          ['get', selectedMetric],
          0, 0,
          metric.colorScale[metric.colorScale.length - 1].value, 1
        ] as mapboxgl.Expression;
        break;
        
      case 'change_from_baseline':
        circleColor = [
          'interpolate',
          ['linear'],
          ['get', 'change_value'],
          ...metric.changeColorScale.flatMap(scale => [scale.value, scale.color])
        ] as mapboxgl.Expression;
        heatmapWeight = [
          'interpolate',
          ['linear'],
          ['abs', ['get', 'change_value']],
          0, 0,
          Math.abs(metric.changeColorScale[metric.changeColorScale.length - 1].value), 1
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
          <p style="margin: 2px 0;"><strong>${METRICS[selectedMetric].label}:</strong> ${(props[selectedMetric] || 0).toFixed(2)}${METRICS[selectedMetric].unit}</p>
        `;
      } else if (visualizationMode === 'change_from_baseline') {
        popupContent += `
          <p style="margin: 2px 0;"><strong>Current Year:</strong> ${props.year}</p>
          <p style="margin: 2px 0;"><strong>Current ${METRICS[selectedMetric].label}:</strong> ${(props[selectedMetric] || 0).toFixed(2)}${METRICS[selectedMetric].unit}</p>
          <p style="margin: 2px 0;"><strong>2013 Baseline:</strong> ${(props.baseline_value || 0).toFixed(2)}${METRICS[selectedMetric].unit}</p>
          <p style="margin: 2px 0; color: ${props.change_value > 0 ? '#22c55e' : props.change_value < 0 ? '#ef4444' : '#6b7280'};"><strong>Change:</strong> ${props.change_value > 0 ? '+' : ''}${(props.change_value || 0).toFixed(2)}${METRICS[selectedMetric].unit}</p>
        `;
      } else if (visualizationMode === 'trend_analysis') {
        popupContent += `
          <p style="margin: 2px 0;"><strong>12-Year Trend:</strong> <span style="color: ${props.trend_direction === 'increasing' ? '#22c55e' : props.trend_direction === 'decreasing' ? '#ef4444' : '#6b7280'}">${props.trend_direction}</span></p>
          <p style="margin: 2px 0;"><strong>Avg ${METRICS[selectedMetric].label}:</strong> ${(props.avg_value || 0).toFixed(2)}${METRICS[selectedMetric].unit}</p>
          <p style="margin: 2px 0;"><strong>Annual Change:</strong> ${props.trend_slope > 0 ? '+' : ''}${(props.trend_slope || 0).toFixed(3)}${METRICS[selectedMetric].unit}/year</p>
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

  }, [selectedYear, visualizationMode, selectedMetric, opacity, isLoaded, canopyData, loading]);

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

  // Calculate average values for each year for the selected metric
  const calculateYearlyAverages = () => {
    if (!canopyData.length) return [];

    const yearlyData = new Map<number, { sum: number; count: number }>();
    
    canopyData.forEach(point => {
      const year = point.year;
      const value = point[selectedMetric];
      
      if (!yearlyData.has(year)) {
        yearlyData.set(year, { sum: 0, count: 0 });
      }
      
      const current = yearlyData.get(year)!;
      current.sum += value;
      current.count += 1;
    });

    return Array.from(yearlyData.entries())
      .map(([year, data]) => ({
        year,
        value: data.sum / data.count
      }))
      .sort((a, b) => a.year - b.year);
  };

  // Calculate correlation data for the selected year
  const calculateCorrelationData = () => {
    if (!canopyData.length) return [];

    return canopyData
      .filter(point => point.year === selectedYearForCorrelation)
      .map(point => ({
        x: point[selectedMetricsForCorrelation[0]],
        y: point[selectedMetricsForCorrelation[1]],
        pixel_id: point.pixel_id
      }));
  };

  // Calculate correlation coefficient
  const calculateCorrelation = (data: { x: number; y: number }[]) => {
    if (data.length < 2) return 0;

    const n = data.length;
    const sumX = data.reduce((sum, point) => sum + point.x, 0);
    const sumY = data.reduce((sum, point) => sum + point.y, 0);
    const sumXY = data.reduce((sum, point) => sum + point.x * point.y, 0);
    const sumX2 = data.reduce((sum, point) => sum + point.x * point.x, 0);
    const sumY2 = data.reduce((sum, point) => sum + point.y * point.y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  };

  return (
    <div className="w-full h-screen relative">
      {/* Control Panel */}
      <div className="absolute top-4 left-4 z-10 bg-white p-4 rounded-lg shadow-lg min-w-96 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4 text-gray-800">Mangaroa Zone 1 Analysis</h2>
        
        {/* Metric Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-gray-700">Metric</label>
          <select 
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as Metric)}
            className="w-full p-2 bg-white border border-gray-300 rounded text-gray-800"
          >
            {Object.entries(METRICS).map(([key, metric]) => (
              <option key={key} value={key}>
                {metric.label}
              </option>
            ))}
          </select>
        </div>

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

        {/* Correlation Analysis */}
        {visualizationMode === 'correlation' && (
          <div className="mb-4">
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-700">Year</label>
              <select
                value={selectedYearForCorrelation}
                onChange={(e) => setSelectedYearForCorrelation(Number(e.target.value))}
                className="w-full p-2 bg-white border border-gray-300 rounded text-gray-800"
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">X-Axis Metric</label>
                <select
                  value={selectedMetricsForCorrelation[0]}
                  onChange={(e) => setSelectedMetricsForCorrelation([e.target.value as Metric, selectedMetricsForCorrelation[1]])}
                  className="w-full p-2 bg-white border border-gray-300 rounded text-gray-800"
                >
                  {Object.entries(METRICS).map(([key, metric]) => (
                    <option key={key} value={key}>
                      {metric.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Y-Axis Metric</label>
                <select
                  value={selectedMetricsForCorrelation[1]}
                  onChange={(e) => setSelectedMetricsForCorrelation([selectedMetricsForCorrelation[0], e.target.value as Metric])}
                  className="w-full p-2 bg-white border border-gray-300 rounded text-gray-800"
                >
                  {Object.entries(METRICS).map(([key, metric]) => (
                    <option key={key} value={key}>
                      {metric.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="h-64 w-full mb-2">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={METRICS[selectedMetricsForCorrelation[0]].label}
                    unit={METRICS[selectedMetricsForCorrelation[0]].unit}
                    label={{
                      value: METRICS[selectedMetricsForCorrelation[0]].label + (METRICS[selectedMetricsForCorrelation[0]].unit ? ` (${METRICS[selectedMetricsForCorrelation[0]].unit})` : ''),
                      position: 'insideBottom',
                      offset: -5
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={METRICS[selectedMetricsForCorrelation[1]].label}
                    unit={METRICS[selectedMetricsForCorrelation[1]].unit}
                    label={{
                      value: METRICS[selectedMetricsForCorrelation[1]].label + (METRICS[selectedMetricsForCorrelation[1]].unit ? ` (${METRICS[selectedMetricsForCorrelation[1]].unit})` : ''),
                      angle: -90,
                      position: 'insideLeft',
                      style: { textAnchor: 'middle' }
                    }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      value.toFixed(2) + (name === 'x' ? METRICS[selectedMetricsForCorrelation[0]].unit : METRICS[selectedMetricsForCorrelation[1]].unit),
                      name === 'x' ? METRICS[selectedMetricsForCorrelation[0]].label : METRICS[selectedMetricsForCorrelation[1]].label
                    ]}
                    labelFormatter={(label) => `Pixel ID: ${label}`}
                  />
                  <Scatter
                    name="Correlation"
                    data={calculateCorrelationData()}
                    fill="#2563eb"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <div className="text-sm text-gray-600">
              <p className="font-medium">Correlation Analysis</p>
              <p>Year: {selectedYearForCorrelation}</p>
              <p>Correlation Coefficient: {calculateCorrelation(calculateCorrelationData()).toFixed(3)}</p>
              <p className="text-xs mt-1">
                {calculateCorrelation(calculateCorrelationData()) > 0.7 ? 'Strong positive correlation' :
                 calculateCorrelation(calculateCorrelationData()) > 0.3 ? 'Moderate positive correlation' :
                 calculateCorrelation(calculateCorrelationData()) > -0.3 ? 'Weak correlation' :
                 calculateCorrelation(calculateCorrelationData()) > -0.7 ? 'Moderate negative correlation' :
                 'Strong negative correlation'}
              </p>
            </div>
          </div>
        )}

        {/* Trend Chart */}
        {visualizationMode !== 'correlation' && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-gray-700">Trend Over Time</label>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={calculateYearlyAverages()}
                  margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="year" 
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Year', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    label={{ 
                      value: METRICS[selectedMetric].label + (METRICS[selectedMetric].unit ? ` (${METRICS[selectedMetric].unit})` : ''),
                      angle: -90,
                      position: 'insideLeft',
                      style: { textAnchor: 'middle' }
                    }}
                  />
                  <Tooltip
                    formatter={(value: number) => [value.toFixed(2) + METRICS[selectedMetric].unit, METRICS[selectedMetric].label]}
                    labelFormatter={(year) => `Year: ${year}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={METRICS[selectedMetric].label}
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

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
                {METRICS[selectedMetric].colorScale.map((scale, index, array) => (
                  <div key={index} className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: scale.color }}></div>
                    <span className="text-xs">
                      {index === 0 ? 'Low' : index === array.length - 1 ? 'Very High' : 'Medium'} 
                      ({scale.value}{METRICS[selectedMetric].unit})
                    </span>
                  </div>
                ))}
              </>
            )}
            {visualizationMode === 'change_from_baseline' && (
              <>
                {METRICS[selectedMetric].changeColorScale.map((scale, index, array) => (
                  <div key={index} className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: scale.color }}></div>
                    <span className="text-xs">
                      {index === 0 ? 'Large Decrease' : 
                       index === 1 ? 'Moderate Decrease' :
                       index === 2 ? 'No Change' :
                       index === 3 ? 'Moderate Increase' : 'Large Increase'}
                      ({scale.value}{METRICS[selectedMetric].unit})
                    </span>
                  </div>
                ))}
              </>
            )}
            {visualizationMode === 'trend_analysis' && (
              <>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#2ca02c' }}></div>
                  <span className="text-xs">Increasing Trend (&gt;+0.5{METRICS[selectedMetric].unit}/year)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#1f77b4' }}></div>
                  <span className="text-xs">Stable (-0.5 to +0.5{METRICS[selectedMetric].unit}/year)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#d62728' }}></div>
                  <span className="text-xs">Decreasing Trend (&lt;-0.5{METRICS[selectedMetric].unit}/year)</span>
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
          <p className="font-medium">Mangaroa Analysis</p>
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