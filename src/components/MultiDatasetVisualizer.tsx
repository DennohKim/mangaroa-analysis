"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Slider } from '@/components/ui/slider';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Dataset configuration
const DATASETS = {
  mangaroa: {
    label: 'Mangaroa Canopy Cover',
    description: 'Time-series canopy cover data (2013-2024)',
    file: '/data/mangaroa_sampling_zone_1_kanop_screening_25_m.csv',
    type: 'time_series'
  },
  glad: {
    label: 'GLAD Forest Cover Loss/Gain',
    description: 'Global forest change detection',
    file: '/data/glad_forest_cover_loss_gain.csv',
    type: 'forest_change'
  },
  io_class: {
    label: 'IO-9 Land Use Classification',
    description: 'Land use classification (2017-2023)',
    file: '/data/io-9-class-10m.csv',
    type: 'classification'
  },
  jrc_cover: {
    label: 'JRC Forest Cover 2020',
    description: 'European Commission forest cover',
    file: '/data/jrc_forest_cover_2020.csv',
    type: 'binary'
  },
  jrc_type: {
    label: 'JRC Forest Type 2020',
    description: 'European Commission forest type',
    file: '/data/jrc_forest_type_2020.csv',
    type: 'binary'
  }
} as const;

type DatasetKey = keyof typeof DATASETS;

// Base data point interface
interface BaseDataPoint {
  id: string;
  pixel_id: number;
  x: number;
  y: number;
  coordinates: [number, number];
  dataset: DatasetKey;
}

// Dataset-specific interfaces
interface MangaroaDataPoint extends BaseDataPoint {
  year: number;
  canopy_cover: number;
  tree_height: number;
  living_biomass: number;
  carbon_stock: number;
  diversity_index: number;
}

interface GLADDataPoint extends BaseDataPoint {
  datamask: number;
  gain: number;
  lossyear: number;
  treecover2000: number;
  has_data: boolean;
  has_forest_gain: boolean;
  forest_loss_year: number | null;
  baseline_tree_cover: number;
}

interface IOClassDataPoint extends BaseDataPoint {
  class_2017: number;
  class_2018: number;
  class_2019: number;
  class_2020: number;
  class_2021: number;
  class_2022: number;
  class_2023: number;
  has_data: boolean;
  dominant_class: number;
}

interface JRCDataPoint extends BaseDataPoint {
  forest_cover_2020?: number;
  forest_type_2020?: number;
  has_data: boolean;
  is_forest: boolean;
}

type DataPoint = MangaroaDataPoint | GLADDataPoint | IOClassDataPoint | JRCDataPoint;

// Data processing functions
const processMangaroaData = async (): Promise<MangaroaDataPoint[]> => {
  try {
    console.log('Loading Mangaroa dataset...');
    const response = await fetch('/data/mangaroa_sampling_zone_1_kanop_screening_25_m.csv');
    const csvText = await response.text();
    
    const Papa = await import('papaparse');
    const parsed = Papa.parse<Record<string, any>>(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true
    });

    const processedData = parsed.data.map((row: Record<string, any>, index) => {
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
        diversity_index: parseFloat(cleanRow.raos_q_diversity_index) || 0,
        dataset: 'mangaroa' as const
      };
    }).filter(row => 
      !isNaN(row.x) && !isNaN(row.y) && !isNaN(row.year) && row.year >= 2013 && row.year <= 2024
    );

    // Create unique pixel IDs
    const pixelMap = new Map();
    let pixelCounter = 0;
    processedData.forEach(row => {
      const coordKey = `${row.x.toFixed(6)}_${row.y.toFixed(6)}`;
      if (!pixelMap.has(coordKey)) {
        pixelMap.set(coordKey, pixelCounter++);
      }
      row.pixel_id = pixelMap.get(coordKey);
    });

    console.log('Processed Mangaroa data:', processedData.length);
    return processedData;
  } catch (error) {
    console.error('Error processing Mangaroa data:', error);
    return [];
  }
};

const processGLADData = async (): Promise<GLADDataPoint[]> => {
  try {
    console.log('Loading GLAD dataset...');
    const response = await fetch('/data/glad_forest_cover_loss_gain.csv');
    const csvText = await response.text();
    
    const Papa = await import('papaparse');
    const parsed = Papa.parse<Record<string, any>>(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true
    });

    const processedData = parsed.data.map((row: Record<string, any>, index) => ({
      id: `glad_${row.x}_${row.y}`,
      pixel_id: index,
      x: parseFloat(row.x),
      y: parseFloat(row.y),
      coordinates: [parseFloat(row.x), parseFloat(row.y)] as [number, number],
      datamask: parseInt(row.datamask),
      gain: parseInt(row.gain),
      lossyear: parseInt(row.lossyear),
      treecover2000: parseInt(row.treecover2000),
      has_data: parseInt(row.datamask) === 1,
      has_forest_gain: parseInt(row.gain) === 1,
      forest_loss_year: parseInt(row.lossyear) > 0 ? 2000 + parseInt(row.lossyear) : null,
      baseline_tree_cover: parseInt(row.treecover2000),
      dataset: 'glad' as const
    })).filter(row => 
      !isNaN(row.x) && !isNaN(row.y) && row.has_data
    );

    console.log('Processed GLAD data:', processedData.length);
    return processedData;
  } catch (error) {
    console.error('Error processing GLAD data:', error);
    return [];
  }
};

const processIOClassData = async (): Promise<IOClassDataPoint[]> => {
  try {
    console.log('Loading IO-9-class dataset...');
    const response = await fetch('/data/io-9-class-10m.csv');
    const csvText = await response.text();
    
    const Papa = await import('papaparse');
    const parsed = Papa.parse<Record<string, any>>(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true
    });

    const processedData = parsed.data.map((row: Record<string, any>, index) => ({
      id: `io_${row.x}_${row.y}`,
      pixel_id: index,
      x: parseFloat(row.x),
      y: parseFloat(row.y),
      coordinates: [parseFloat(row.x), parseFloat(row.y)] as [number, number],
      class_2017: parseInt(row.class_2017),
      class_2018: parseInt(row.class_2018),
      class_2019: parseInt(row.class_2019),
      class_2020: parseInt(row.class_2020),
      class_2021: parseInt(row.class_2021),
      class_2022: parseInt(row.class_2022),
      class_2023: parseInt(row.class_2023),
      has_data: parseInt(row.class_2017) !== 255,
      dominant_class: parseInt(row.class_2017),
      dataset: 'io_class' as const
    })).filter(row => 
      !isNaN(row.x) && !isNaN(row.y) && row.has_data
    );

    console.log('Processed IO-9-class data:', processedData.length);
    return processedData;
  } catch (error) {
    console.error('Error processing IO-9-class data:', error);
    return [];
  }
};

const processJRCCoverData = async (): Promise<JRCDataPoint[]> => {
  try {
    console.log('Loading JRC Forest Cover dataset...');
    const response = await fetch('/data/jrc_forest_cover_2020.csv');
    const csvText = await response.text();
    
    const Papa = await import('papaparse');
    const parsed = Papa.parse<Record<string, any>>(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true
    });

    const processedData = parsed.data.map((row: Record<string, any>, index) => ({
      id: `jrc_cover_${row.x}_${row.y}`,
      pixel_id: index,
      x: parseFloat(row.x),
      y: parseFloat(row.y),
      coordinates: [parseFloat(row.x), parseFloat(row.y)] as [number, number],
      forest_cover_2020: parseInt(row.forest_cover_2020),
      has_data: parseInt(row.forest_cover_2020) !== 255,
      is_forest: parseInt(row.forest_cover_2020) === 0,
      dataset: 'jrc_cover' as const
    })).filter(row => 
      !isNaN(row.x) && !isNaN(row.y) && row.has_data
    );

    console.log('Processed JRC Forest Cover data:', processedData.length);
    return processedData;
  } catch (error) {
    console.error('Error processing JRC Forest Cover data:', error);
    return [];
  }
};

const processJRCTypeData = async (): Promise<JRCDataPoint[]> => {
  try {
    console.log('Loading JRC Forest Type dataset...');
    const response = await fetch('/data/jrc_forest_type_2020.csv');
    const csvText = await response.text();
    
    const Papa = await import('papaparse');
    const parsed = Papa.parse<Record<string, any>>(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true
    });

    const processedData = parsed.data.map((row: Record<string, any>, index) => ({
      id: `jrc_type_${row.x}_${row.y}`,
      pixel_id: index,
      x: parseFloat(row.x),
      y: parseFloat(row.y),
      coordinates: [parseFloat(row.x), parseFloat(row.y)] as [number, number],
      forest_type_2020: parseInt(row.forest_type_2020),
      has_data: parseInt(row.forest_type_2020) !== 255,
      is_forest: parseInt(row.forest_type_2020) === 0,
      dataset: 'jrc_type' as const
    })).filter(row => 
      !isNaN(row.x) && !isNaN(row.y) && row.has_data
    );

    console.log('Processed JRC Forest Type data:', processedData.length);
    return processedData;
  } catch (error) {
    console.error('Error processing JRC Forest Type data:', error);
    return [];
  }
};

const MultiDatasetVisualizer = () => {
  const mapContainer = useRef(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<DatasetKey>('mangaroa');
  const [selectedYear, setSelectedYear] = useState([2024]);
  const [opacity, setOpacity] = useState([80]);
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Load dataset based on selection
  const loadDataset = async (datasetKey: DatasetKey) => {
    setLoading(true);
    try {
      let loadedData: DataPoint[] = [];
      
      switch (datasetKey) {
        case 'mangaroa':
          loadedData = await processMangaroaData();
          break;
        case 'glad':
          loadedData = await processGLADData();
          break;
        case 'io_class':
          loadedData = await processIOClassData();
          break;
        case 'jrc_cover':
          loadedData = await processJRCCoverData();
          break;
        case 'jrc_type':
          loadedData = await processJRCTypeData();
          break;
      }

      setData(loadedData);
    } catch (error) {
      console.error('Error loading dataset:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    try {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

      const mapInstance = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [175.086901, -41.148613],
        zoom: 15
      });

      map.current = mapInstance;

      mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');
      mapInstance.addControl(new mapboxgl.ScaleControl({
        maxWidth: 80,
        unit: 'metric'
      }), 'bottom-left');

      mapInstance.on('load', async () => {
        console.log('Map loaded successfully');
        setIsLoaded(true);
        await loadDataset('mangaroa');
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

  // Load new dataset when selection changes
  useEffect(() => {
    if (isLoaded) {
      loadDataset(selectedDataset);
    }
  }, [selectedDataset, isLoaded]);

  // Create GeoJSON for visualization
  const createVisualizationGeoJSON = () => {
    let visualData = data;
    
    // Filter by year for time-series data
    if (selectedDataset === 'mangaroa') {
      const mangaroaData = data as MangaroaDataPoint[];
      visualData = mangaroaData.filter(d => d.year === selectedYear[0]);
    }

    const geoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: visualData.map(point => {
        const size = 0.00025;
        const [lng, lat] = point.coordinates;
        const square = [
          [lng - size/2, lat - size/2],
          [lng + size/2, lat - size/2],
          [lng + size/2, lat + size/2],
          [lng - size/2, lat + size/2],
          [lng - size/2, lat - size/2]
        ];

        let properties: any = {
          pixel_id: point.pixel_id,
          dataset: point.dataset
        };

        // Add dataset-specific properties
        switch (point.dataset) {
          case 'mangaroa':
            const mangaroaPoint = point as MangaroaDataPoint;
            properties = {
              ...properties,
              year: mangaroaPoint.year,
              canopy_cover: mangaroaPoint.canopy_cover,
              tree_height: mangaroaPoint.tree_height,
              living_biomass: mangaroaPoint.living_biomass,
              carbon_stock: mangaroaPoint.carbon_stock
            };
            break;
          case 'glad':
            const gladPoint = point as GLADDataPoint;
            properties = {
              ...properties,
              has_forest_gain: gladPoint.has_forest_gain,
              forest_loss_year: gladPoint.forest_loss_year,
              baseline_tree_cover: gladPoint.baseline_tree_cover
            };
            break;
          case 'io_class':
            const ioPoint = point as IOClassDataPoint;
            properties = {
              ...properties,
              dominant_class: ioPoint.dominant_class,
              class_2017: ioPoint.class_2017,
              class_2023: ioPoint.class_2023
            };
            break;
          case 'jrc_cover':
          case 'jrc_type':
            const jrcPoint = point as JRCDataPoint;
            properties = {
              ...properties,
              is_forest: jrcPoint.is_forest
            };
            break;
        }

        return {
          type: 'Feature',
          properties,
          geometry: {
            type: 'Polygon',
            coordinates: [square]
          }
        } as GeoJSON.Feature;
      })
    };

    return geoJSON;
  };

  // Update map visualization
  useEffect(() => {
    if (!isLoaded || !data.length || !map.current || loading) return;

    const geoJSON = createVisualizationGeoJSON();

    // Remove existing layers
    ['dataset-layer'].forEach(layerId => {
      if (map.current?.getLayer(layerId)) {
        map.current?.removeLayer(layerId);
      }
    });
    
    if (map.current.getSource('dataset-data')) {
      map.current.removeSource('dataset-data');
    }

    // Add new source
    map.current.addSource('dataset-data', {
      type: 'geojson',
      data: geoJSON
    });

    // Color expressions based on dataset type
    let fillColor: mapboxgl.Expression;
    
    switch (selectedDataset) {
      case 'mangaroa':
        fillColor = [
          'interpolate',
          ['linear'],
          ['get', 'canopy_cover'],
          0, '#ffffcc',
          25, '#a1dab4',
          50, '#41b6c4',
          75, '#2c7fb8',
          100, '#253494'
        ] as mapboxgl.Expression;
        break;
      case 'glad':
        fillColor = [
          'case',
          ['get', 'has_forest_gain'], '#4575b4',
          ['!=', ['get', 'forest_loss_year'], null], '#d73027',
          '#ffffbf'
        ] as mapboxgl.Expression;
        break;
      case 'io_class':
        fillColor = [
          'case',
          ['==', ['get', 'dominant_class'], 11], '#2ca02c',
          '#fee5d9'
        ] as mapboxgl.Expression;
        break;
      case 'jrc_cover':
      case 'jrc_type':
        fillColor = [
          'case',
          ['get', 'is_forest'], '#2ca02c',
          '#fee5d9'
        ] as mapboxgl.Expression;
        break;
      default:
        fillColor = ['literal', '#22c55e'] as mapboxgl.Expression;
    }

    // Add fill layer
    map.current.addLayer({
      id: 'dataset-layer',
      type: 'fill',
      source: 'dataset-data',
      paint: {
        'fill-color': fillColor,
        'fill-outline-color': '#ffffff',
        'fill-opacity': opacity[0] / 100
      }
    });

    // Add click handler
    const handleClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features?.[0]?.properties) return;
      const props = e.features[0].properties;
      
      let popupContent = `
        <div style="padding: 12px; min-width: 250px; font-family: Arial, sans-serif;">
          <h3 style="font-weight: bold; margin-bottom: 8px; color: #2563eb;">Pixel ${props.pixel_id}</h3>
          <p style="margin: 2px 0;"><strong>Dataset:</strong> ${DATASETS[props.dataset as DatasetKey].label}</p>
          <p style="margin: 2px 0;"><strong>Coordinates:</strong> ${e.lngLat.lng.toFixed(6)}, ${e.lngLat.lat.toFixed(6)}</p>
      `;
      
      switch (props.dataset) {
        case 'mangaroa':
          popupContent += `
            <p style="margin: 2px 0;"><strong>Year:</strong> ${props.year}</p>
            <p style="margin: 2px 0;"><strong>Canopy Cover:</strong> ${(props.canopy_cover || 0).toFixed(2)}%</p>
            <p style="margin: 2px 0;"><strong>Tree Height:</strong> ${(props.tree_height || 0).toFixed(2)}m</p>
          `;
          break;
        case 'glad':
          popupContent += `
            <p style="margin: 2px 0;"><strong>Forest Gain:</strong> ${props.has_forest_gain ? 'Yes' : 'No'}</p>
            <p style="margin: 2px 0;"><strong>Loss Year:</strong> ${props.forest_loss_year || 'No loss'}</p>
            <p style="margin: 2px 0;"><strong>Baseline Tree Cover:</strong> ${props.baseline_tree_cover}%</p>
          `;
          break;
        case 'io_class':
          popupContent += `
            <p style="margin: 2px 0;"><strong>Land Class:</strong> ${props.dominant_class === 11 ? 'Forest' : `Class ${props.dominant_class}`}</p>
            <p style="margin: 2px 0;"><strong>2017 Class:</strong> ${props.class_2017}</p>
            <p style="margin: 2px 0;"><strong>2023 Class:</strong> ${props.class_2023}</p>
          `;
          break;
        case 'jrc_cover':
        case 'jrc_type':
          popupContent += `
            <p style="margin: 2px 0;"><strong>Forest Cover:</strong> ${props.is_forest ? 'Forest' : 'Non-forest'}</p>
          `;
          break;
      }
      
      popupContent += '</div>';
      
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(popupContent)
        .addTo(map.current as mapboxgl.Map);
    };

    map.current.off('click', 'dataset-layer' as any);
    map.current.on('click', 'dataset-layer' as any, handleClick);

  }, [selectedDataset, selectedYear, opacity, isLoaded, data, loading]);

  return (
    <div className="w-full h-screen relative">
      {/* Control Panel */}
      <div className="absolute top-4 left-4 z-10 bg-white p-4 rounded-lg shadow-lg min-w-96 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4 text-gray-800">Multi-Dataset Forest Analysis</h2>
        
        {/* Dataset Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-gray-700">Dataset</label>
          <select 
            value={selectedDataset}
            onChange={(e) => setSelectedDataset(e.target.value as DatasetKey)}
            className="w-full p-2 bg-white border border-gray-300 rounded text-gray-800"
          >
            {Object.entries(DATASETS).map(([key, dataset]) => (
              <option key={key} value={key}>
                {dataset.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {DATASETS[selectedDataset].description}
          </p>
        </div>

        {/* Year Selection (only for time-series data) */}
        {selectedDataset === 'mangaroa' && (
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
            {selectedDataset === 'mangaroa' && (
              <>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ffffcc' }}></div>
                  <span className="text-xs">Low Canopy Cover (0-25%)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#41b6c4' }}></div>
                  <span className="text-xs">Medium Canopy Cover (25-75%)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#253494' }}></div>
                  <span className="text-xs">High Canopy Cover (&gt;75%)</span>
                </div>
              </>
            )}
            {selectedDataset === 'glad' && (
              <>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#4575b4' }}></div>
                  <span className="text-xs">Forest Gain</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#d73027' }}></div>
                  <span className="text-xs">Forest Loss</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ffffbf' }}></div>
                  <span className="text-xs">No Change</span>
                </div>
              </>
            )}
            {(selectedDataset === 'io_class' || selectedDataset === 'jrc_cover' || selectedDataset === 'jrc_type') && (
              <>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#2ca02c' }}></div>
                  <span className="text-xs">Forest</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#fee5d9' }}></div>
                  <span className="text-xs">Non-forest</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Dataset Info */}
        <div className="text-xs text-gray-500 border-t pt-2">
          <p><strong>Current Dataset:</strong></p>
          <p>• {DATASETS[selectedDataset].label}</p>
          <p>• Type: {DATASETS[selectedDataset].type}</p>
          <p>• Records: {data.length}</p>
          <p className="mt-2"><strong>Interaction:</strong></p>
          <p>• Click pixels for detailed info</p>
          <p>• Use opacity slider to adjust visibility</p>
        </div>
      </div>

      {/* Map Container */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Loading Overlay */}
      {(!isLoaded || loading) && (
        <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-20">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4 mx-auto"></div>
            <p>{!isLoaded ? 'Loading Mapbox...' : 'Processing Dataset...'}</p>
            <p className="text-sm text-gray-300 mt-2">
              {loading ? `Loading ${DATASETS[selectedDataset].label}...` : 'Initializing map visualization...'}
            </p>
          </div>
        </div>
      )}

      {/* Bottom Info Panel */}
      <div className="absolute bottom-4 right-4 bg-white bg-opacity-95 p-3 rounded-lg shadow-lg">
        <div className="text-xs text-gray-600">
          <p className="font-medium">Multi-Dataset Forest Analysis</p>
          <p>Dataset: {DATASETS[selectedDataset].label}</p>
          {selectedDataset === 'mangaroa' && <p>Year: {selectedYear[0]}</p>}
          {data.length > 0 && (
            <p className="mt-1 text-green-600">
              ✓ {data.length} records loaded
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiDatasetVisualizer; 