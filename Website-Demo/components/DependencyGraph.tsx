
import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { DependencyGraphData, DependencyNode, DependencyEdge, DependencyNodeType, DependencyEdgeType, DependencyCluster } from '../types';

interface DependencyGraphProps {
  graphData: DependencyGraphData;
}

const CARD_WIDTH = 180;
const CARD_HEIGHT = 80;
const CLUSTER_PADDING = { top: 40, right: 20, bottom: 20, left: 20 };


const NODE_COLORS: Record<DependencyNodeType, string> = {
  [DependencyNodeType.SYMPTOM]: '#f87171', // red-400
  [DependencyNodeType.PHYSICAL_EXAM]: '#fb923c', // orange-400
  [DependencyNodeType.INVESTIGATION]: '#fbbf24', // amber-400
  [DependencyNodeType.DIAGNOSIS]: '#c084fc', // purple-400
  [DependencyNodeType.TREATMENT]: '#60a5fa', // blue-400
  [DependencyNodeType.OUTCOME]: '#34d399', // green-400
  [DependencyNodeType.SIDE_EFFECT]: '#f472b6', // pink-400
  [DependencyNodeType.OPINION]: '#a3a3a3', // neutral-400
};

const EDGE_COLORS: Record<DependencyEdgeType, string> = {
    [DependencyEdgeType.CAUSAL]: '#a78bfa', // violet-400
    [DependencyEdgeType.THERAPEUTIC]: '#2dd4bf', // teal-400
    [DependencyEdgeType.DIAGNOSTIC]: '#f472b6', // pink-400
    [DependencyEdgeType.EXCLUSIONARY]: '#9ca3af', // gray-400
    [DependencyEdgeType.CORRELATIONAL]: '#a3a3a3', // neutral-400
};

const Legend: React.FC<{ colorMode: 'type' | 'author', authorColors: d3.ScaleOrdinal<string, string> }> = ({ colorMode, authorColors }) => (
    <div className="absolute bottom-4 left-4 bg-gray-900/80 p-3 rounded-lg ring-1 ring-white/10 text-xs text-gray-300 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
        {colorMode === 'type' ? (
            <>
                <div>
                    <h4 className="font-bold text-sm text-white mb-2">Node Types</h4>
                    <div className="space-y-1">
                        {Object.entries(NODE_COLORS).map(([type, color]) => (
                            <div key={type} className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: `${color}B3` }}></div>
                                <span>{type}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <h4 className="font-bold text-sm text-white mb-2 mt-3">Edge Types</h4>
                    <div className="space-y-2">
                        {Object.entries(EDGE_COLORS).map(([type, color]) => (
                            <div key={type} className="flex items-center space-x-2">
                                <div className="w-4 h-0.5" style={{ backgroundColor: color }}></div>
                                <span>{type}</span>
                            </div>
                        ))}
                        <div className="flex items-center space-x-2">
                            <div className="w-4 border-t-2 border-dashed border-red-500"></div>
                            <span>Conflict</span>
                        </div>
                    </div>
                </div>
            </>
        ) : (
             <div>
                <h4 className="font-bold text-sm text-white mb-2">Authorship</h4>
                <p className="text-gray-400 mb-2 text-[11px]">Node borders are colored by author.</p>
                <div className="space-y-1">
                    {authorColors.domain().map(author => (
                        <div key={author} className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: authorColors(author) }}></div>
                            <span>{author}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}
    </div>
);


const DependencyGraph: React.FC<DependencyGraphProps> = ({ graphData }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [colorMode, setColorMode] = useState<'type' | 'author'>('type');

  const timeDomain = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) {
      const now = Date.now();
      return { min: now, max: now };
    }
    const allTimestamps = [
        ...graphData.nodes.map(n => n.timestamp.getTime()),
        ...graphData.edges.map(e => e.timestamp.getTime())
    ];
    return {
      min: Math.min(...allTimestamps),
      max: Math.max(...allTimestamps),
    };
  }, [graphData]);
  
  const [timeValue, setTimeValue] = useState(timeDomain.max);
  
  useEffect(() => {
    setTimeValue(timeDomain.max);
  }, [timeDomain.max]);

  const authorColors = useMemo(() => {
    const authors = [...new Set(graphData.nodes.map(n => n.author))];
    return d3.scaleOrdinal(d3.schemeTableau10).domain(authors);
  }, [graphData.nodes]);


  const filteredData = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [], clusters: [] };
    const time = timeValue;

    const visibleNodes = graphData.nodes.filter(n => n.timestamp.getTime() <= time);
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = graphData.edges.filter(e => 
      e.timestamp.getTime() <= time &&
      visibleNodeIds.has(e.source) &&
      visibleNodeIds.has(e.target)
    );
    const visibleClusterIds = new Set(visibleNodes.map(n => n.clusterId).filter(Boolean));
    const visibleClusters = graphData.clusters.filter(c => visibleClusterIds.has(c.id));

    return { nodes: visibleNodes, edges: visibleEdges, clusters: visibleClusters };
  }, [graphData, timeValue]);


  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !filteredData) return;

    const { nodes: dataNodes, edges: dataEdges, clusters: dataClusters } = filteredData;
    const container = containerRef.current;
    let { width, height } = container.getBoundingClientRect();
    if(width === 0 || height === 0) return;

    const simulation = d3.forceSimulation(dataNodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(dataEdges).id((d: any) => d.id).distance(250).strength(0.6))
      .force('charge', d3.forceManyBody().strength(-1500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(Math.max(CARD_WIDTH, CARD_HEIGHT) / 2 + 20).strength(1));

    function clusteringForce(alpha: number) {
      const clusterMap = new Map<string, { x: number, y: number, count: number }>();
      dataNodes.forEach((node: any) => {
          if (!node.clusterId) return;
          const cluster = clusterMap.get(node.clusterId) || { x: 0, y: 0, count: 0 };
          cluster.x += node.x;
          cluster.y += node.y;
          cluster.count++;
          clusterMap.set(node.clusterId, cluster);
      });

      clusterMap.forEach(c => { c.x /= c.count; c.y /= c.count; });

      dataNodes.forEach((node: any) => {
          if (!node.clusterId) return;
          const center = clusterMap.get(node.clusterId);
          if (center) {
              node.vx += (center.x - node.x) * 0.1 * alpha;
              node.vy += (center.y - node.y) * 0.1 * alpha;
          }
      });
    }

    simulation.force('cluster', clusteringForce);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g');

    const edgeColorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(Object.keys(EDGE_COLORS));
    g.append('defs').selectAll('marker')
      .data(Object.values(EDGE_COLORS).concat(['#ef4444']))
      .join('marker')
        .attr('id', d => `arrow-${d.replace('#','')}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 10)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
      .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', d => d);
    
    const clusterG = g.append('g').attr('class', 'clusters').selectAll('g').data(dataClusters).join('g');
    const clusterRects = clusterG.append('rect').attr('rx', 12).attr('ry', 12).attr('fill', '#1f2937CC').attr('stroke', '#4b5563').attr('stroke-width', 1.5);
    const clusterLabels = clusterG.append('text').attr('fill', '#d1d5db').attr('font-weight', 'bold').attr('font-size', '14px').text(d => d.label);

    const link = g.append('g')
      .attr('stroke-opacity', 0.9)
      .selectAll('path')
      .data(dataEdges)
      .join('path')
        .attr('stroke', d => d.isConflict ? '#ef4444' : EDGE_COLORS[d.type])
        .attr('stroke-width', d => d.isConflict ? 2.5 : 2)
        .attr('stroke-dasharray', d => d.type === DependencyEdgeType.EXCLUSIONARY || d.isConflict ? '6,6' : 'none')
        .attr('marker-end', d => `url(#arrow-${(d.isConflict ? '#ef4444' : EDGE_COLORS[d.type]).replace('#','')})`)
        .attr('fill', 'none');

    const node = g.append('g')
      .selectAll('g')
      .data(dataNodes)
      .join('g')
      .call(drag(simulation) as any);

    node.append('foreignObject')
      .attr('width', CARD_WIDTH)
      .attr('height', CARD_HEIGHT)
      .attr('x', -CARD_WIDTH / 2)
      .attr('y', -CARD_HEIGHT / 2)
      .style('pointer-events', 'none')
      .append('xhtml:div')
        .attr('class', 'w-full h-full p-2.5 rounded-lg shadow-lg text-white flex flex-col border-4 transition-all duration-300 overflow-hidden')
        .style('background-color', d => `${NODE_COLORS[d.type]}4D`)
        .style('border-color', d => colorMode === 'author' ? authorColors(d.author) : NODE_COLORS[d.type])
        .html(d => `
          <div class="font-bold text-sm leading-tight" style="text-shadow: 1px 1px 2px #00000080;" title="${d.label}">
            ${d.label.length > 50 ? d.label.substring(0, 47) + '...' : d.label}
          </div>
          <div class="text-[11px] opacity-80 mt-1">${d.type}</div>
          <div class="mt-auto text-xs opacity-80 text-right font-medium">
            - ${d.author}
          </div>
        `);
    
    node.append('title')
        .text(d => `${d.label} (${d.type})\nAuthor: ${d.author}\nTimestamp: ${d.timestamp.toLocaleDateString()}${d.details ? `\nDetails: ${d.details}`:''}`);

    simulation.on('tick', () => {
      const nodeById = new Map(dataNodes.map((n:any) => [n.id, n]));
      link.attr('d', (d: any) => {
        const source = nodeById.get(d.source.id || d.source);
        const target = nodeById.get(d.target.id || d.target);
        if(!source || !target) return '';

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dr = Math.sqrt(dx * dx + dy * dy);
        
        const offsetX = (dx * CARD_WIDTH/2) / dr;
        const offsetY = (dy * CARD_HEIGHT/2) / dr;

        const sourceX = source.x + (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? CARD_WIDTH/2 : -CARD_WIDTH/2) : offsetX);
        const sourceY = source.y + (Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? CARD_HEIGHT/2 : -CARD_HEIGHT/2) : offsetY);
        const targetX = target.x - (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? CARD_WIDTH/2 : -CARD_WIDTH/2) : offsetX);
        const targetY = target.y - (Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? CARD_HEIGHT/2 : -CARD_HEIGHT/2) : offsetY);

        return `M${sourceX},${sourceY}L${targetX},${targetY}`;
      });
      node.attr('transform', (d: any) => `translate(${d.x}, ${d.y})`);

      const clusterBBoxes: Map<string, {x1:number, y1:number, x2:number, y2:number}> = new Map();
      dataNodes.forEach((n: any) => {
          if (!n.clusterId) return;
          const bbox = clusterBBoxes.get(n.clusterId) || { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
          bbox.x1 = Math.min(bbox.x1, n.x - CARD_WIDTH / 2);
          bbox.y1 = Math.min(bbox.y1, n.y - CARD_HEIGHT / 2);
          bbox.x2 = Math.max(bbox.x2, n.x + CARD_WIDTH / 2);
          bbox.y2 = Math.max(bbox.y2, n.y + CARD_HEIGHT / 2);
          clusterBBoxes.set(n.clusterId, bbox);
      });

      clusterRects
          .attr('x', d => clusterBBoxes.has(d.id) ? clusterBBoxes.get(d.id)!.x1 - CLUSTER_PADDING.left : 0)
          .attr('y', d => clusterBBoxes.has(d.id) ? clusterBBoxes.get(d.id)!.y1 - CLUSTER_PADDING.top : 0)
          .attr('width', d => clusterBBoxes.has(d.id) ? (clusterBBoxes.get(d.id)!.x2 - clusterBBoxes.get(d.id)!.x1) + CLUSTER_PADDING.left + CLUSTER_PADDING.right : 0)
          .attr('height', d => clusterBBoxes.has(d.id) ? (clusterBBoxes.get(d.id)!.y2 - clusterBBoxes.get(d.id)!.y1) + CLUSTER_PADDING.top + CLUSTER_PADDING.bottom : 0);
      clusterLabels
          .attr('x', d => clusterBBoxes.has(d.id) ? clusterBBoxes.get(d.id)!.x1 - (CLUSTER_PADDING.left - 5) : 0)
          .attr('y', d => clusterBBoxes.has(d.id) ? clusterBBoxes.get(d.id)!.y1 - (CLUSTER_PADDING.top - 20) : 0);
    });

    const zoom = d3.zoom().scaleExtent([0.2, 5]).on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
    svg.call(zoom as any);

    function drag(simulation: d3.Simulation<d3.SimulationNodeDatum, undefined>) {
        function dragstarted(event: d3.D3DragEvent<any, any, any>, d: any) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        function dragged(event: d3.D3DragEvent<any, any, any>, d: any) {
            d.fx = event.x;
            d.fy = event.y;
        }
        function dragended(event: d3.D3DragEvent<any, any, any>, d: any) {
            if (!event.active) simulation.alphaTarget(0);
            if(d.fx && d.fy) {
                // Keep node fixed after drag
            } else {
              d.fx = null;
              d.fy = null;
            }
        }
        return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
    }
    
    return () => {
      simulation.stop();
    };

  }, [filteredData, authorColors, colorMode]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-gray-900/50">
      <svg ref={svgRef} className="w-full h-full"></svg>
      <Legend colorMode={colorMode} authorColors={authorColors} />
      <div className="absolute top-4 right-4 bg-gray-900/80 p-2 rounded-lg ring-1 ring-white/10 text-gray-300 flex items-center space-x-2">
        <span className="text-sm font-semibold text-white px-2">View Mode:</span>
        <button onClick={() => setColorMode('type')} className={`px-3 py-1 text-sm rounded-md transition-colors ${colorMode === 'type' ? 'bg-brand-blue text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Type</button>
        <button onClick={() => setColorMode('author')} className={`px-3 py-1 text-sm rounded-md transition-colors ${colorMode === 'author' ? 'bg-brand-purple text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Author</button>
      </div>
      <div className="absolute bottom-4 right-4 bg-gray-900/80 p-3 rounded-lg ring-1 ring-white/10 text-gray-300 flex flex-col space-y-2 w-96">
          <label htmlFor="time-slider" className="text-sm font-semibold text-white">
            Investigation Timeline
          </label>
          <input
            id="time-slider"
            type="range"
            min={timeDomain.min}
            max={timeDomain.max}
            value={timeValue}
            onChange={(e) => setTimeValue(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>{new Date(timeDomain.min).toLocaleDateString()}</span>
            <span className="font-bold text-white">{new Date(timeValue).toLocaleDateString()}</span>
            <span>{new Date(timeDomain.max).toLocaleDateString()}</span>
          </div>
      </div>
    </div>
  );
};

export default DependencyGraph;
