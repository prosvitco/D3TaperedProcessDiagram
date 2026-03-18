/**
 * TaperedProcessDiagram
 *
 * @author Prosvit.Design
 * @link   https://prosvit.design/
 */
class TaperedProcessDiagram {
  constructor(config = {}) {
    this.layout = {
      width:                   config.width                   ?? 900,
      height:                  config.height                  ?? 700,
      funnelLeftX:             config.funnelLeftX             ?? 220,
      funnelRightX:            config.funnelRightX            ?? 650,
      centerY:                 config.centerY                 ?? 360,
      leftHalf:                config.leftHalf                ?? 140,
      rightHalf:               config.rightHalf               ?? 45,
      titleY:                  config.titleY                  ?? 70,
      annotationTextOffset:    config.annotationTextOffset    ?? 70,
      annotationLineGap:       config.annotationLineGap       ?? 18,
      annotationLineTargetGap: config.annotationLineTargetGap ?? 12,
      annotationLineHeight:    config.annotationLineHeight    ?? 24,
      direction:               this.#normalizeDirection(config.direction),
    };

    this.style = {
      polygonStrokeWidth: config.polygonStrokeWidth ?? 1,
      dividerWidth:       config.dividerWidth       ?? 2,
    };

    this.animation = {
      stageDuration: config.stageDuration ?? 700,
      stageDelay:    config.stageDelay    ?? 350,
      fadeDuration:  config.fadeDuration  ?? 420,
    };

    this.lastRenderInput = null;
  }

  render({ el, data, animate = true }) {
    this.lastRenderInput = { el, data };

    const svg = d3.select(el)
      .attr("viewBox", `0 0 ${this.layout.width} ${this.layout.height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    svg.selectAll("*").remove();

    this.#appendMarkers(svg);

    const sections   = this.#computeSections(data.sections);

    this.#appendSectionPolygons(svg, sections, animate);
    this.#appendBorders(svg, sections, animate);
    this.#appendDividers(svg, sections, animate);
    this.#appendSideLabels(svg, data.startLabel, data.endLabel);
    this.#appendAnnotations(svg, sections, animate);
  }

  restartAnimation() {
    if (this.lastRenderInput) this.render({ ...this.lastRenderInput, animate: true });
  }

  #normalizeDirection(dir) {
    const v = (dir || "ltr").toLowerCase().trim();
    return ["ltr", "rtl", "ttb", "btt"].includes(v) ? v : "ltr";
  }

  #mapPoint(u, v) {
    const { width, height } = this.layout;
    const cx = width  / 2;
    const cy = height / 2;
    const du = u - cx;
    const dv = v - cy;

    switch (this.layout.direction) {
      case "rtl": return { x: cx - du, y: cy + dv };
      case "ttb": return { x: cx - dv, y: cy + du };
      case "btt": return { x: cx + dv, y: cy - du };
      default:    return { x: cx + du, y: cy + dv };
    }
  }

  #outwardNormal(side) {
    const left = side === "left";
    switch (this.layout.direction) {
      case "ttb": return left ? { nx:  1, ny: 0 } : { nx: -1, ny: 0 };
      case "btt": return left ? { nx: -1, ny: 0 } : { nx:  1, ny: 0 };
      default:    return left ? { nx:  0, ny: -1 } : { nx:  0, ny:  1 };
    }
  }

  #topV(u)    { return this.layout.centerY - this.#halfHeightAt(u); }
  #bottomV(u) { return this.layout.centerY + this.#halfHeightAt(u); }

  #halfHeightAt(u) {
    const { funnelLeftX, funnelRightX, leftHalf, rightHalf } = this.layout;
    const t = (u - funnelLeftX) / (funnelRightX - funnelLeftX);
    return leftHalf + t * (rightHalf - leftHalf);
  }

  #lineCoords(u1, v1, u2, v2) {
    const p1 = this.#mapPoint(u1, v1);
    const p2 = this.#mapPoint(u2, v2);
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }

  #clampPoint(pt, margin = 18) {
    return {
      x: Math.max(margin, Math.min(this.layout.width  - margin, pt.x)),
      y: Math.max(margin, Math.min(this.layout.height - margin, pt.y)),
    };
  }

  #appendMarkers(svg) {
    const id = `arrowhead-${Math.random().toString(36).slice(2, 9)}`;
    svg.append("defs")
      .append("marker")
      .attr("id", id)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 8).attr("refY", 0)
      .attr("markerWidth", 7).attr("markerHeight", 7)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "context-stroke");
    this.markerRef = `url(#${id})`;
  }

  #computeSections(rawSections) {
    const total = d3.sum(rawSections, s => s.width);
    let acc = 0;
    return rawSections.map((s, index) => {
      const t0 = acc / total;
      acc += s.width;
      const t1 = acc / total;
      const { funnelLeftX: fl, funnelRightX: fr } = this.layout;
      return { ...s, index, x0: fl + (fr - fl) * t0, x1: fl + (fr - fl) * t1 };
    });
  }

  #sectionPolygonPoints(section) {
    return [
      [section.x0, this.#topV(section.x0)],
      [section.x1, this.#topV(section.x1)],
      [section.x1, this.#bottomV(section.x1)],
      [section.x0, this.#bottomV(section.x0)],
    ].map(([u, v]) => this.#mapPoint(u, v));
  }

  #appendSectionPolygons(svg, sections, animate) {
    const isVertical = ["ttb", "btt"].includes(this.layout.direction);

    const polygons = svg.selectAll(".section")
      .data(sections)
      .enter()
      .append("polygon")
      .attr("class", "section")
      .attr("points", s =>
        this.#sectionPolygonPoints(s).map(p => `${p.x},${p.y}`).join(" "))
      .attr("fill",         s => s.background)
      .attr("stroke",       s => s.border?.color || "none")
      .attr("stroke-width", s => s.border?.width ?? this.style.polygonStrokeWidth);

    if (!animate) return;

    polygons
      .attr("opacity", 0)
      .attr("transform-origin", s => {
        const p = this.#mapPoint(s.x0, this.layout.centerY);
        return `${p.x}px ${p.y}px`;
      })
      .attr("transform", isVertical ? "scale(1,0.6)" : "scale(0.6,1)")
      .transition()
      .delay(s => s.index * this.animation.stageDelay)
      .duration(this.animation.stageDuration)
      .attr("opacity", 1)
      .attr("transform", "scale(1,1)");
  }

  #appendBorders(svg, sections, animate) {
    const { funnelLeftX: fl, funnelRightX: fr } = this.layout;
    const first = sections[0] || {};
    const last  = sections[sections.length - 1] || {};

    const borderData = [
      {
        ...this.#lineCoords(fl, this.#topV(fl), fl, this.#bottomV(fl)),
        stroke:      first.border?.color || "#666",
        strokeWidth: first.border?.width ?? this.style.polygonStrokeWidth,
        delayIndex:  0,
      },
      {
        ...this.#lineCoords(fr, this.#topV(fr), fr, this.#bottomV(fr)),
        stroke:      last.border?.color || "#666",
        strokeWidth: last.border?.width ?? this.style.polygonStrokeWidth,
        delayIndex:  sections.length - 1,
      },
    ];

    const borders = svg.selectAll(".border")
      .data(borderData)
      .enter()
      .append("line")
      .attr("class", "border")
      .attr("x1", d => d.x1).attr("y1", d => d.y1)
      .attr("x2", d => d.x2).attr("y2", d => d.y2)
      .attr("stroke", d => d.stroke)
      .attr("stroke-width", d => d.strokeWidth);

    if (animate) {
      borders.attr("opacity", 0)
        .transition()
        .delay(d => d.delayIndex * this.animation.stageDelay)
        .duration(this.animation.fadeDuration)
        .attr("opacity", 1);
    }
  }

  #appendDividers(svg, sections, animate) {
    const dividers = svg.selectAll(".divider")
      .data(sections.slice(0, -1))
      .enter()
      .append("line")
      .attr("class", "divider")
      .attr("x1", s => this.#lineCoords(s.x1, this.#topV(s.x1), s.x1, this.#bottomV(s.x1)).x1)
      .attr("y1", s => this.#lineCoords(s.x1, this.#topV(s.x1), s.x1, this.#bottomV(s.x1)).y1)
      .attr("x2", s => this.#lineCoords(s.x1, this.#topV(s.x1), s.x1, this.#bottomV(s.x1)).x2)
      .attr("y2", s => this.#lineCoords(s.x1, this.#topV(s.x1), s.x1, this.#bottomV(s.x1)).y2)
      .attr("stroke",       s => s.divider?.color || s.border?.color || "#666")
      .attr("stroke-width", s => s.divider?.width ?? this.style.dividerWidth);

    if (animate) {
      dividers.attr("opacity", 0)
        .transition()
        .delay(s => (s.index + 1) * this.animation.stageDelay)
        .duration(this.animation.fadeDuration)
        .attr("opacity", 1);
    }
  }

  #labelAnchor(kind, offset) {
    const { funnelLeftX: fl, funnelRightX: fr, centerY } = this.layout;
    const capU      = kind === "start" ? fl : fr;
    const capScreen = this.#mapPoint(capU, centerY);
    const { fx, fy } = this.#flowDirection();
    const sign = kind === "start" ? -1 : 1;
    const blockX = capScreen.x + sign * fx * offset;
    const blockY = capScreen.y + sign * fy * offset;
    const xSign = fx * sign;
    const textAnchor = xSign > 0 ? "start" : xSign < 0 ? "end" : "middle";
    return { x: blockX, y: blockY, textAnchor };
  }

  #flowDirection() {
    switch (this.layout.direction) {
      case "rtl": return { fx: -1, fy:  0 };
      case "ttb": return { fx:  0, fy:  1 };
      case "btt": return { fx:  0, fy: -1 };
      default:    return { fx:  1, fy:  0 };
    }
  }

  #perpDirection() {
    switch (this.layout.direction) {
      case "ttb": return { px: -1, py:  0 };
      case "btt": return { px:  1, py:  0 };
      default:    return { px:  0, py:  1 };
    }
  }

  #appendSideLabels(svg, startLabel = {}, endLabel = {}) {
    const appendLabel = (labelCfg, kind) => {
      const text = labelCfg?.label;
      if (!text) return;
      const anchor = this.#labelAnchor(kind, labelCfg.offset ?? 85);
      const pt     = this.#clampPoint({ x: anchor.x, y: anchor.y });
      svg.append("text")
        .attr("class", kind === "start" ? "side-label start-label" : "side-label end-label")
        .attr("x", pt.x)
        .attr("y", pt.y)
        .attr("text-anchor", anchor.textAnchor)
        .attr("dominant-baseline", "middle")
        .text(text);
    };

    appendLabel(startLabel, "start");
    appendLabel(endLabel,   "end");
  }

  #appendAnnotations(svg, sections, animate) {
    sections.forEach(section => {
      const ann = section.annotation;
      if (!ann) return;

      const u           = (section.x0 + section.x1) / 2;
      const side        = ann.side;
      const edgeV       = side === "left" ? this.#topV(u) : this.#bottomV(u);
      const edgePt      = this.#mapPoint(u, edgeV);
      const { nx, ny }  = this.#outwardNormal(side);
      const color       = ann.color || "#9a9a9a";

      const arrowTip = {
        x: edgePt.x + nx * this.layout.annotationLineTargetGap,
        y: edgePt.y + ny * this.layout.annotationLineTargetGap,
      };

      const blockInner = {
        x: edgePt.x + nx * this.layout.annotationTextOffset,
        y: edgePt.y + ny * this.layout.annotationTextOffset,
      };

      const textLines  = ann.label.split("\n");
      const lineHeight = this.layout.annotationLineHeight;
      const delay      = section.index * this.animation.stageDelay + this.animation.stageDuration * 0.5;
      const textAnchor = nx > 0 ? "start" : nx < 0 ? "end" : "middle";

      textLines.forEach((line, i) => {
        const step = textLines.length - 1 - i;
        const pt = this.#clampPoint({
          x: blockInner.x + nx * step * lineHeight,
          y: blockInner.y + ny * step * lineHeight,
        });

        const el = svg.append("text")
          .attr("class", "annotation-text")
          .attr("x", pt.x)
          .attr("y", pt.y)
          .attr("text-anchor", textAnchor)
          .attr("dominant-baseline", "middle")
          .style("fill", color)
          .text(line);

        if (animate) {
          el.attr("opacity", 0)
            .transition()
            .delay(delay)
            .duration(this.animation.fadeDuration)
            .attr("opacity", 1);
        }
      });

      const lineStart = this.#clampPoint({
        x: blockInner.x - nx * this.layout.annotationLineGap,
        y: blockInner.y - ny * this.layout.annotationLineGap,
      });

      const lineEl = svg.append("line")
        .attr("class", "annotation-line")
        .attr("x1", lineStart.x).attr("y1", lineStart.y)
        .attr("x2", arrowTip.x) .attr("y2", arrowTip.y)
        .style("stroke", color)
        .attr("marker-end", this.markerRef);

      if (animate) {
        lineEl.attr("opacity", 0)
          .transition()
          .delay(delay)
          .duration(this.animation.fadeDuration)
          .attr("opacity", 1);
      }
    });
  }
}

function initTaperedProcessDiagram({ el, data, options = {}, animate = true } = {}) {
  const diagram = new TaperedProcessDiagram(options);
  diagram.render({ el, data, animate });
  return diagram;
}

function initAllTaperedProcessDiagrams(configs = []) {
  return configs.map(config => initTaperedProcessDiagram(config));
}

function restartAllTaperedProcessDiagrams(diagrams = []) {
  diagrams.forEach(d => d?.restartAnimation?.());
}

window.TaperedProcessDiagram            = TaperedProcessDiagram;
window.initTaperedProcessDiagram        = initTaperedProcessDiagram;
window.initAllTaperedProcessDiagrams    = initAllTaperedProcessDiagrams;
window.restartAllTaperedProcessDiagrams = restartAllTaperedProcessDiagrams;