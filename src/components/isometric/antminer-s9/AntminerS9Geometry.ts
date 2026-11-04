/**
 * BITMAIN ANTMINER S9 — ISOMETRIC GEOMETRY GENERATOR
 *
 * Implements 100% of the Anatomy craftsmanship rules:
 * - 4-tone depth shading (shades 0..3, top, lit, bevel)
 * - Ground halo and realistic contact shadow
 * - Exact physical construction of Bitmain Antminer S9 (Chassis, 2x 120mm PWM Fans, Control Board, 3x Hashboards)
 * - Support for Assembled and Exploded mechanical poses
 */

import * as k from '../anatomy-kit/iso-kit';
import type { Projection, Point3, Flat, SolidPaths } from '../anatomy-kit/iso-kit';
import type { AntminerPose, AntminerSubassembly, ExplodedOffsets } from './AntminerS9Model';
import { getExplodedOffsets } from './AntminerS9Model';

export interface AntminerRenderItem {
  id: string;
  subassembly: AntminerSubassembly;
  depth: number;
  svg: string;
}

export const S9_PROJECTION: Projection = {
  origin: [400, 270],
  scale: 1.15,
  azimuth: 42,
  elevation: 32
};

export class AntminerS9Geometry {
  private P: Projection;

  constructor(projection: Projection = S9_PROJECTION) {
    this.P = projection;
  }

  /**
   * Helper to render a Solid using iso-kit SolidPaths with Anatomy 4-tone markup
   */
  private renderSolid(
    paths: SolidPaths,
    tone: 'hi' | 'mid' | 'lo' | 'faint' = 'mid',
    options?: {
      lit?: boolean;
      creaseTone?: 'hi' | 'mid' | 'lo' | 'faint' | 'none';
      customClass?: string;
      customFill?: string;
      customTop?: string;
    }
  ): string {
    const isLit = options?.lit ? ' data-lit' : '';
    const customClass = options?.customClass ? ` ${options.customClass}` : '';
    const creaseTone = options?.creaseTone ?? 'faint';

    const fillStyle = options?.customFill ? ` style="fill: ${options.customFill};"` : '';
    const topStyle = options?.customTop ? ` style="fill: ${options.customTop};"` : '';

    const shadesHtml = paths.shades
      .map((d, i) => (d ? `<path class="iso-shade" data-shade="${i}" d="${d}"/>` : ''))
      .join('');

    const creaseHtml =
      creaseTone !== 'none' && paths.crease
        ? `<path class="iso-line iso-crease" data-tone="${creaseTone}" d="${paths.crease}"/>`
        : '';

    const bevelHtml =
      creaseTone !== 'none' && paths.bevel
        ? `<path class="iso-line iso-bevel" data-tone="${creaseTone}" d="${paths.bevel}"/>`
        : '';

    return `<g class="iso-solid${customClass}"${isLit}>
      <path class="iso-fill" d="${paths.fill}"${fillStyle}/>
      ${shadesHtml}
      <path class="iso-top" d="${paths.top}"${topStyle}/>
      ${creaseHtml}
      ${bevelHtml}
      <path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/>
    </g>`;
  }

  /**
   * Helper to compute average depth of an assembly bounding box
   */
  private computeDepth(center: Point3): number {
    return k.depthOf(center, this.P);
  }

  /**
   * Generates all 104+ physical parts sorted by painter's depth order
   */
  public generateScene(
    pose: AntminerPose = 'ASSEMBLED',
    activeSubassembly: AntminerSubassembly | null = null,
    fanAngleDeg = 0
  ): { items: AntminerRenderItem[]; haloSvg: string } {
    const offsets: ExplodedOffsets = getExplodedOffsets(pose);
    const items: AntminerRenderItem[] = [];

    // --- 1. GROUND HALO (Soft Contact Shadow) ---
    const haloPlan = { x: -180, y: -75, w: 360, d: 150, r: 24 };
    const haloSvg = `<path class="iso-halo" d="${k.haloOf(haloPlan, -18, 16, this.P)}" />`;

    // --- 2. BASE & CHASSIS ASSEMBLY ---
    const isChassisLit = activeSubassembly === 'CHASSIS';
    const cOff = offsets.chassis;

    // 4 Rubber isolation feet
    const footPositions: [number, number][] = [
      [-135, -50],
      [135, -50],
      [-135, 50],
      [135, 50]
    ];
    for (const [fx, fy] of footPositions) {
      const footSolid = k.cylinder(fx + cOff[0], fy + cOff[1], 8, -12 + cOff[2], 12, this.P, 24, 1.2);
      items.push({
        id: `foot-${fx}-${fy}`,
        subassembly: 'CHASSIS',
        depth: this.computeDepth([fx + cOff[0], fy + cOff[1], -6 + cOff[2]]),
        svg: this.renderSolid(footSolid, 'lo', { customFill: '#0D1117' })
      });
    }

    // Main Tunnel Extruded Aluminum Body
    // Length X: -140 to 140 (w = 280), Width Y: -54 to 54 (d = 108), Height Z: 0 to 105 (h = 105)
    const chassisPlan = { x: -140 + cOff[0], y: -54 + cOff[1], w: 280, d: 108, r: 4 };
    const chassisSolid = k.slabOf(chassisPlan, 0 + cOff[2], 105, this.P, 8, 2.0);

    // Lateral cooling fin ribs on visible side
    const sideRibs: string[] = [];
    for (const zRib of [20, 38, 56, 74, 92]) {
      const ribD = k.sideSeam(chassisPlan, zRib + cOff[2], this.P, 8);
      sideRibs.push(`<path class="iso-line" data-tone="faint" d="${ribD}"/>`);
    }

    // Mounting ears for fans on front and rear flanges
    const flangeFront = k.slabOf({ x: -142 + cOff[0], y: -57 + cOff[1], w: 4, d: 114, r: 2 }, 0 + cOff[2], 108, this.P, 4, 0.8);
    const flangeRear = k.slabOf({ x: 138 + cOff[0], y: -57 + cOff[1], w: 4, d: 114, r: 2 }, 0 + cOff[2], 108, this.P, 4, 0.8);

    items.push({
      id: 'chassis-flange-front',
      subassembly: 'CHASSIS',
      depth: this.computeDepth([-142 + cOff[0], 0 + cOff[1], 54 + cOff[2]]),
      svg: this.renderSolid(flangeFront, isChassisLit ? 'hi' : 'mid', { lit: isChassisLit })
    });

    items.push({
      id: 'chassis-flange-rear',
      subassembly: 'CHASSIS',
      depth: this.computeDepth([138 + cOff[0], 0 + cOff[1], 54 + cOff[2]]),
      svg: this.renderSolid(flangeRear, isChassisLit ? 'hi' : 'mid', { lit: isChassisLit })
    });

    items.push({
      id: 'chassis-main-tunnel',
      subassembly: 'CHASSIS',
      depth: this.computeDepth([0 + cOff[0], 0 + cOff[1], 52 + cOff[2]]),
      svg: this.renderSolid(chassisSolid, isChassisLit ? 'hi' : 'mid', {
        lit: isChassisLit,
        customClass: 's9-aluminum-body'
      }) + sideRibs.join('')
    });

    // --- 3. FRONT INTAKE FAN ASSEMBLY (120mm x 120mm x 38mm) ---
    const isFanFrontLit = activeSubassembly === 'FAN_FRONT';
    const ffOff = offsets.fanFront;
    const ffX = -178 + ffOff[0];
    const ffCenter: Point3 = [ffX + 19, ffOff[1], 52.5 + ffOff[2]];

    // Square PBT thermoplastic shroud
    const fanFrontPlan = { x: ffX, y: -58 + ffOff[1], w: 36, d: 116, r: 5 };
    const fanFrontShroud = k.slabOf(fanFrontPlan, 0 + ffOff[2], 108, this.P, 6, 2.5);

    // Central motor hub
    const hubFrontCenter: Point3 = [ffX - 1, ffOff[1], 54 + ffOff[2]];
    const hubFront2D = k.iso(hubFrontCenter, this.P);

    // 7 Aerodynamic turbine blades (smooth rotation based on fanAngleDeg)
    const bladeSvgs: string[] = [];
    const rad = (fanAngleDeg * Math.PI) / 180;
    for (let b = 0; b < 7; b++) {
      const angle = rad + (b * 2 * Math.PI) / 7;
      const bladeTip3D: Point3 = [
        ffX - 1.5,
        ffOff[1] + Math.cos(angle) * 44,
        54 + ffOff[2] + Math.sin(angle) * 44
      ];
      const bladeTip2D = k.iso(bladeTip3D, this.P);
      const bladeEdge2D = k.iso([
        ffX - 1.0,
        ffOff[1] + Math.cos(angle + 0.3) * 38,
        54 + ffOff[2] + Math.sin(angle + 0.3) * 38
      ], this.P);

      bladeSvgs.push(
        `<path class="s9-fan-blade" d="M${hubFront2D[0]} ${hubFront2D[1]} Q${bladeEdge2D[0]} ${bladeEdge2D[1]} ${bladeTip2D[0]} ${bladeTip2D[1]} Z" fill="var(--anatomy-shade-3)" stroke="var(--anatomy-mid)" stroke-width="0.7"/>`
      );
    }

    // Steel wire finger guard (concentric wire rings + 4 radial cross-wires)
    const wireGuardSvgs: string[] = [];
    // Outer mounting ring
    const ringRadii = [18, 30, 42, 48];
    for (const r of ringRadii) {
      const ringPts: Flat[] = [];
      for (let s = 0; s <= 28; s++) {
        const theta = (s * 2 * Math.PI) / 28;
        ringPts.push(k.iso([ffX - 3, ffOff[1] + Math.cos(theta) * r, 54 + ffOff[2] + Math.sin(theta) * r], this.P));
      }
      wireGuardSvgs.push(`<path class="iso-line" data-tone="hi" stroke-width="0.8" d="${k.pathOf(ringPts, true)}"/>`);
    }
    // 4 Cross wires
    for (const angle of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
      const p1 = k.iso([ffX - 3.5, ffOff[1] + Math.cos(angle) * 12, 54 + ffOff[2] + Math.sin(angle) * 12], this.P);
      const p2 = k.iso([ffX - 3.5, ffOff[1] + Math.cos(angle) * 50, 54 + ffOff[2] + Math.sin(angle) * 50], this.P);
      wireGuardSvgs.push(`<path class="iso-line" data-tone="hi" stroke-width="1.0" d="M${p1[0]} ${p1[1]} L${p2[0]} ${p2[1]}"/>`);
    }

    // 4 Corner M4 hex bolts
    const fanCornerBolts: string[] = [];
    for (const [by, bz] of [[-48, 12], [48, 12], [-48, 96], [48, 96]]) {
      const boltPt = k.iso([ffX - 3.2, ffOff[1] + by, ffOff[2] + bz], this.P);
      fanCornerBolts.push(`<circle cx="${boltPt[0]}" cy="${boltPt[1]}" r="2.2" class="s9-hex-bolt" fill="#1A202C" stroke="#000" stroke-width="0.5"/>`);
      fanCornerBolts.push(`<circle cx="${boltPt[0]}" cy="${boltPt[1]}" r="0.9" fill="#05DF72" opacity="0.6"/>`);
    }

    items.push({
      id: 'fan-front-assembly',
      subassembly: 'FAN_FRONT',
      depth: this.computeDepth(ffCenter),
      svg: `<g class="s9-fan-front"${isFanFrontLit ? ' data-lit' : ''}>
        ${this.renderSolid(fanFrontShroud, isFanFrontLit ? 'hi' : 'lo', { lit: isFanFrontLit, customFill: '#111827' })}
        <g class="s9-blades-group">${bladeSvgs.join('')}</g>
        <circle cx="${hubFront2D[0]}" cy="${hubFront2D[1]}" r="9" class="s9-motor-hub" fill="url(#metallicGradient)" stroke="var(--anatomy-hi)" stroke-width="1"/>
        <circle cx="${hubFront2D[0]}" cy="${hubFront2D[1]}" r="4" fill="#05DF72" opacity="0.8"/>
        ${wireGuardSvgs.join('')}
        ${fanCornerBolts.join('')}
      </g>`
    });

    // --- 4. REAR EXHAUST FAN ASSEMBLY ---
    const isFanRearLit = activeSubassembly === 'FAN_REAR';
    const frOff = offsets.fanRear;
    const frX = 142 + frOff[0];
    const frCenter: Point3 = [frX + 18, frOff[1], 52.5 + frOff[2]];

    const fanRearPlan = { x: frX, y: -58 + frOff[1], w: 36, d: 116, r: 5 };
    const fanRearShroud = k.slabOf(fanRearPlan, 0 + frOff[2], 108, this.P, 6, 2.5);

    const hubRearCenter: Point3 = [frX + 37, frOff[1], 54 + frOff[2]];
    const hubRear2D = k.iso(hubRearCenter, this.P);

    items.push({
      id: 'fan-rear-assembly',
      subassembly: 'FAN_REAR',
      depth: this.computeDepth(frCenter),
      svg: `<g class="s9-fan-rear"${isFanRearLit ? ' data-lit' : ''}>
        ${this.renderSolid(fanRearShroud, isFanRearLit ? 'hi' : 'lo', { lit: isFanRearLit, customFill: '#0F172A' })}
        <circle cx="${hubRear2D[0]}" cy="${hubRear2D[1]}" r="8" fill="#1E293B" stroke="var(--anatomy-lo)" stroke-width="0.8"/>
      </g>`
    });

    // --- 5. TOP CONTROL BOARD HOUSING & INTERFACE ---
    const isCtrlLit = activeSubassembly === 'CONTROL_BOARD';
    const ctrlOff = offsets.controlTop;
    // Positioned over top of chassis: X: -50 to 110 (w = 160), Y: -42 to 42 (d = 84), Z: 105 to 142 (h = 37)
    const ctrlPlan = { x: -50 + ctrlOff[0], y: -42 + ctrlOff[1], w: 160, d: 84, r: 3 };
    const ctrlEnclosure = k.slabOf(ctrlPlan, 105 + ctrlOff[2], 37, this.P, 6, 1.4);

    // Front Face of Control Board (carrying RJ45, LEDs, SD slot, IP button)
    const frontFaceX = -50 + ctrlOff[0];
    // RJ45 Ethernet Port with metallic shield
    const rj45Plan = { x: frontFaceX - 6, y: -30 + ctrlOff[1], w: 6, d: 20, r: 1 };
    const rj45Solid = k.slabOf(rj45Plan, 114 + ctrlOff[2], 18, this.P, 2, 0.4);

    // LED indicators on control board front
    const ledNormalPt = k.iso([frontFaceX - 0.5, 4 + ctrlOff[1], 128 + ctrlOff[2]], this.P);
    const ledFaultPt = k.iso([frontFaceX - 0.5, 14 + ctrlOff[1], 128 + ctrlOff[2]], this.P);
    const ipButtonPt = k.iso([frontFaceX - 1.0, 24 + ctrlOff[1], 122 + ctrlOff[2]], this.P);
    const rj45LedGreen = k.iso([frontFaceX - 6.2, -26 + ctrlOff[1], 130 + ctrlOff[2]], this.P);
    const rj45LedAmber = k.iso([frontFaceX - 6.2, -14 + ctrlOff[1], 130 + ctrlOff[2]], this.P);

    // Top PCIe power connector on Control Board
    const ctrlPciePlan = { x: 30 + ctrlOff[0], y: -12 + ctrlOff[1], w: 22, d: 14, r: 1 };
    const ctrlPcieSolid = k.slabOf(ctrlPciePlan, 142 + ctrlOff[2], 12, this.P, 2, 0.4);

    // 3 Ribbon cable IDC dual-row headers on Control Board
    const idcHeaders: string[] = [];
    for (let c = 0; c < 3; c++) {
      const idcX = -24 + c * 22 + ctrlOff[0];
      const idcSolid = k.slabOf({ x: idcX, y: 16 + ctrlOff[1], w: 16, d: 10, r: 0.8 }, 142 + ctrlOff[2], 8, this.P, 2, 0.2);
      idcHeaders.push(this.renderSolid(idcSolid, 'mid', { customFill: '#1E293B' }));
    }

    const ctrlSvg = `<g class="s9-control-board"${isCtrlLit ? ' data-lit' : ''}>
      ${this.renderSolid(ctrlEnclosure, isCtrlLit ? 'hi' : 'mid', { lit: isCtrlLit, customFill: '#1E293B' })}
      ${this.renderSolid(rj45Solid, 'hi', { customFill: '#94A3B8' })}
      <circle cx="${rj45LedGreen[0]}" cy="${rj45LedGreen[1]}" r="1.4" fill="#05DF72" filter="url(#glowGreen)"/>
      <circle cx="${rj45LedAmber[0]}" cy="${rj45LedAmber[1]}" r="1.4" fill="#F59E0B"/>
      
      <!-- Normal (Green) and Fault (Red) Status LEDs -->
      <circle cx="${ledNormalPt[0]}" cy="${ledNormalPt[1]}" r="2.0" fill="#05DF72" stroke="#000" stroke-width="0.5"/>
      <circle cx="${ledNormalPt[0]}" cy="${ledNormalPt[1]}" r="1.0" fill="#FFFFFF"/>
      <circle cx="${ledFaultPt[0]}" cy="${ledFaultPt[1]}" r="2.0" fill="#EF4444" stroke="#000" stroke-width="0.5" opacity="0.4"/>
      
      <!-- IP Report micro tactile switch -->
      <circle cx="${ipButtonPt[0]}" cy="${ipButtonPt[1]}" r="2.8" fill="#D97706" stroke="#451A03" stroke-width="0.6"/>
      <circle cx="${ipButtonPt[0]}" cy="${ipButtonPt[1]}" r="1.4" fill="#FDE68A"/>

      <!-- Control Board PCIe Power Socket -->
      ${this.renderSolid(ctrlPcieSolid, 'lo', { customFill: '#0F172A' })}
      ${idcHeaders.join('')}
    </g>`;

    items.push({
      id: 'control-board-assembly',
      subassembly: 'CONTROL_BOARD',
      depth: this.computeDepth([30 + ctrlOff[0], 0 + ctrlOff[1], 125 + ctrlOff[2]]),
      svg: ctrlSvg
    });

    // --- 6. 3x SLIDE-IN HASHBOARDS WITH BM1387 CHIPS & HEATSINKS ---
    // The Antminer S9 has exactly 3 hashboards arranged in parallel slots along Y:
    // Hashboard 0: Y = -32
    // Hashboard 1: Y = 0
    // Hashboard 2: Y = 32
    const hashboardConfigs = [
      { id: 'hashboard-0', sub: 'HASHBOARD_0' as AntminerSubassembly, yBase: -32, off: offsets.hashboard0, label: 'Cadena 1' },
      { id: 'hashboard-1', sub: 'HASHBOARD_1' as AntminerSubassembly, yBase: 0, off: offsets.hashboard1, label: 'Cadena 2' },
      { id: 'hashboard-2', sub: 'HASHBOARD_2' as AntminerSubassembly, yBase: 32, off: offsets.hashboard2, label: 'Cadena 3' }
    ];

    for (const hcfg of hashboardConfigs) {
      const isHbLit = activeSubassembly === hcfg.sub;
      const hOff = hcfg.off;
      const hbY = hcfg.yBase + hOff[1];
      const hbZ = 12 + hOff[2];
      const hbCenter: Point3 = [0 + hOff[0], hbY, hbZ + 42];

      // PCB Substrate (dark emerald green solder mask / aluminum substrate)
      const pcbPlan = { x: -128 + hOff[0], y: hbY - 2.5, w: 256, d: 5, r: 1.2 };
      const pcbSolid = k.slabOf(pcbPlan, hbZ, 84, this.P, 2, 0.4);

      // 3x Heavy-duty 6-pin PCIe 12V Power sockets on top edge of each board
      const pcieSvgs: string[] = [];
      for (let p = 0; p < 3; p++) {
        const pX = -60 + p * 55 + hOff[0];
        const pciePlan = { x: pX, y: hbY - 6, w: 20, d: 12, r: 0.8 };
        const pcieSolid = k.slabOf(pciePlan, hbZ + 84, 14, this.P, 2, 0.4);
        pcieSvgs.push(this.renderSolid(pcieSolid, isHbLit ? 'hi' : 'lo', { customFill: '#090D16' }));

        // 6 Gold terminal pins inside receptacle
        const pinCenter = k.iso([pX + 10, hbY, hbZ + 98], this.P);
        pcieSvgs.push(`<circle cx="${pinCenter[0]}" cy="${pinCenter[1]}" r="1.8" fill="#F59E0B" opacity="0.9"/>`);
      }

      // BM1387 ASIC Chip Packages & Extruded Aluminum Heatsinks
      // Sample 6 dense chip blocks with heatsink fin grooves representing the 63 chips
      const heatsinkSvgs: string[] = [];
      for (let chipIdx = 0; chipIdx < 6; chipIdx++) {
        const cX = -110 + chipIdx * 38 + hOff[0];
        // ASIC Package substrate
        const chipPlan = { x: cX, y: hbY - 4.5, w: 24, d: 2, r: 0.5 };
        const chipSolid = k.slabOf(chipPlan, hbZ + 22, 40, this.P, 2, 0.2);
        heatsinkSvgs.push(this.renderSolid(chipSolid, 'lo', { customFill: '#0D1117' }));

        // Pin-fin individual aluminum heatsink block
        const hsPlan = { x: cX + 2, y: hbY - 7.5, w: 20, d: 3, r: 0.4 };
        const hsSolid = k.slabOf(hsPlan, hbZ + 24, 36, this.P, 2, 0.4);
        heatsinkSvgs.push(this.renderSolid(hsSolid, isHbLit ? 'hi' : 'mid', {
          lit: isHbLit,
          customFill: '#64748B'
        }));

        // Vertical heatsink fin grooves
        for (const finOffset of [5, 10, 15]) {
          const p1 = k.iso([cX + 2 + finOffset, hbY - 7.6, hbZ + 25], this.P);
          const p2 = k.iso([cX + 2 + finOffset, hbY - 7.6, hbZ + 59], this.P);
          heatsinkSvgs.push(`<path class="iso-line" data-tone="faint" d="M${p1[0]} ${p1[1]} L${p2[0]} ${p2[1]}"/>`);
        }
      }

      // Decoupling solid-state capacitors (silver cylinders with dark stripes)
      for (let capIdx = 0; capIdx < 3; capIdx++) {
        const capX = -90 + capIdx * 76 + hOff[0];
        const capSolid = k.cylinder(capX, hbY - 4.5, 3.5, hbZ + 68, 8, this.P, 16, 0.4);
        heatsinkSvgs.push(this.renderSolid(capSolid, 'hi', { customFill: '#E2E8F0' }));
      }

      // Front 18-pin IDC ribbon socket on hashboard
      const idcSocketPlan = { x: -126 + hOff[0], y: hbY - 4, w: 14, d: 8, r: 0.6 };
      const idcSocket = k.slabOf(idcSocketPlan, hbZ + 66, 10, this.P, 2, 0.2);
      const idcSvg = this.renderSolid(idcSocket, 'mid', { customFill: '#1E293B' });

      items.push({
        id: hcfg.id,
        subassembly: hcfg.sub,
        depth: this.computeDepth(hbCenter),
        svg: `<g class="s9-hashboard" id="${hcfg.id}"${isHbLit ? ' data-lit' : ''}>
          ${this.renderSolid(pcbSolid, isHbLit ? 'hi' : 'mid', {
            lit: isHbLit,
            customFill: isHbLit ? '#05DF72' : '#064E3B'
          })}
          ${pcieSvgs.join('')}
          ${heatsinkSvgs.join('')}
          ${idcSvg}
        </g>`
      });
    }

    // --- 7. DATA RIBBON CABLES (Control Board -> Hashboards) ---
    const isRibbonLit = activeSubassembly === 'RIBBON_CABLES';
    const rOff = offsets.ribbonCables;
    const ribbonSvgs: string[] = [];

    // 3 Flexible gray ribbon cables connecting the top control headers to each board
    for (let i = 0; i < 3; i++) {
      const startP3: Point3 = [-24 + i * 22 + offsets.controlTop[0], 20 + offsets.controlTop[1], 144 + offsets.controlTop[2]];
      const hbDest = hashboardConfigs[i]!;
      const endP3: Point3 = [-120 + hbDest.off[0], hbDest.yBase + hbDest.off[1], 72 + hbDest.off[2]];

      const pStart = k.iso(startP3, this.P);
      const pMid1 = k.iso([startP3[0] - 18 + rOff[0], startP3[1] + 12 + rOff[1], startP3[2] - 12 + rOff[2]], this.P);
      const pMid2 = k.iso([endP3[0] + 16 + rOff[0], endP3[1] + 6 + rOff[1], endP3[2] + 24 + rOff[2]], this.P);
      const pEnd = k.iso(endP3, this.P);

      // Ribbon ribbon stripe (gray flat cable with red pin-1 indicator line)
      ribbonSvgs.push(
        `<path class="s9-ribbon-cable" d="M${pStart[0]} ${pStart[1]} C${pMid1[0]} ${pMid1[1]}, ${pMid2[0]} ${pMid2[1]}, ${pEnd[0]} ${pEnd[1]}" fill="none" stroke="${isRibbonLit ? '#05DF72' : '#94A3B8'}" stroke-width="4.5" stroke-linecap="round"/>`
      );
      // Red edge tracer line (Pin 1 polarity marker)
      ribbonSvgs.push(
        `<path d="M${pStart[0]} ${pStart[1]} C${pMid1[0]} ${pMid1[1]}, ${pMid2[0]} ${pMid2[1]}, ${pEnd[0]} ${pEnd[1]}" fill="none" stroke="#EF4444" stroke-width="0.9" stroke-linecap="round"/>`
      );
    }

    items.push({
      id: 'ribbon-cables-assembly',
      subassembly: 'RIBBON_CABLES',
      depth: this.computeDepth([-60, 10, 110]),
      svg: `<g class="s9-ribbons"${isRibbonLit ? ' data-lit' : ''}>${ribbonSvgs.join('')}</g>`
    });

    // --- 8. PAINTER'S ORDER SORTING ---
    // Strictly sort all items ascending by depthOf (far before near)
    items.sort((a, b) => a.depth - b.depth);

    return { items, haloSvg };
  }
}
