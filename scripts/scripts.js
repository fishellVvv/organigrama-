/* ─────────────────────────  scripts.js  ────────────────────────── */

const width = 800;
const radius = width / 2;
const AMPLITUDE = 0.6;
const EXPONENT = 3;
const levelRadii = [1, 120, 300, 420];

function getTextWidth(text, fontSize = 12) {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = `${fontSize}px sans-serif`;
  return ctx.measureText(text).width;
}

function splitText(text, maxLen = 16) {
  const words = text.split(" ");
  const out = [];
  let line = "";
  for (const w of words) {
    if ((line + w).length <= maxLen) line += (line ? " " : "") + w;
    else {
      if (line) out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

const svg = d3.select("svg").attr("viewBox", [-radius, -radius, width, width]);

const angleWeight = (t) =>
  1 + AMPLITUDE * Math.pow(Math.abs(Math.cos(t * 2 * Math.PI)), EXPONENT);

async function loadHierarchy(url) {
  const csv = await d3.csv(url);
  const map = new Map();
  csv.forEach((d) => map.set(d.id, { ...d, children: [] }));
  let root = null;
  csv.forEach((d) => {
    const node = map.get(d.id);
    if (d.parent) map.get(d.parent).children.push(node);
    else root = node;
  });
  return d3.hierarchy(root);
}

loadHierarchy(
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTNXhGTkH8VkrFUx8kfwH37I2FfRKk7iwbHsDpfhNGBZj7EvNCNuzBA6ihlVfkmVR7JhM_NtzkEq4nt/pub?gid=1139573771&single=true&output=csv"
).then((root) => {
  /* ───────────────────── Posicionamiento ───────────────────── */

  const levels = [];
  root.each((d) => {
    if (!levels[d.depth]) levels[d.depth] = [];
    levels[d.depth].push(d);
  });

  if (levels[0]) {
    levels[0][0].x = Math.PI / 2;
    levels[0][0].y = levelRadii[0];
  }

  levels.forEach((nodes, depth) => {
    if (depth === 0) return;
    if (depth === 3) {
      const OFFSET = 0.165;
      d3.group(nodes, (d) => d.parent).forEach((grp, parent) => {
        const n = grp.length;
        grp.forEach((d, i) => {
          d.x = parent.x + (i - (n - 1) / 2) * OFFSET;
          d.y = levelRadii[depth] || 480;
        });
      });
    } else {
      const weights = nodes.map((_, i) => angleWeight(i / (nodes.length - 1)));
      const scale = d3
        .scaleLinear()
        .domain([0, d3.sum(weights)])
        .range([0, 2 * Math.PI]);
      let acc = 0;
      nodes.forEach((d, i) => {
        acc += weights[i] / 2;
        d.x = scale(acc);
        d.y = levelRadii[depth] || 480;
        acc += weights[i] / 2;
      });
    }
  });

  /* ─────────── Capa de líneas (SIEMPRE detrás de todo) ─────────── */

  const linkPaths = svg
    .insert("g", ":first-child") // ← se coloca al fondo
    .attr("class", "link")
    .selectAll("path")
    .data(root.links())
    .join("path")
    .attr("class", "enlace")
    .each(function (d) {
      d.el = this;
    }) // guardo referencia DOM
    .attr(
      "d",
      d3
        .linkRadial()
        .angle((d) => d.x)
        .radius((d) => d.y)
    );

  /* ───────────── Capa de nodos ───────────── */

  const nodes = svg
    .append("g")
    .selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("class", (d) => `node depth-${d.depth}`)
    .attr("transform", (d) => {
      const a = d.x - Math.PI / 2;
      return `translate(${Math.cos(a) * d.y},${Math.sin(a) * d.y})`;
    });

  const etiquetas = nodes
    .append("g")
    .attr("class", "etiqueta")
    .each(function (d) {
      d.el = this;
    });

  /* ───────────── Click: opacar / resaltar ───────────── */

  etiquetas.on("click", function (event, d) {
    event.stopPropagation();

    svg
      .selectAll(".etiqueta")
      .classed("apagado", true)
      .classed("resaltado", false);
    linkPaths
      .classed("apagado", true)
      .classed("resaltado", false)
      .style("stroke", null)
      .style("stroke-opacity", null)
      .style("stroke-width", null);

    const set = new Set();
    for (let n = d; n; n = n.parent) set.add(n);

    set.forEach((n) =>
      d3.select(n.el).classed("resaltado", true).classed("apagado", false)
    );

    linkPaths.each(function (l) {
      if (set.has(l.source) && set.has(l.target)) {
        d3.select(this)
          .classed("resaltado", true)
          .classed("apagado", false)
          .style("stroke", "#cfcfcf")
          .style("stroke-opacity", 0.85)
          .style("stroke-width", 2.2);
      }
    });
  });

  /* ───────────  click vacío → reset ─────────── */

  svg.on("click", () => {
    svg.selectAll(".etiqueta,.enlace").classed("apagado resaltado", false);
    linkPaths
      .style("stroke", null)
      .style("stroke-opacity", null)
      .style("stroke-width", null);
  });

  /* ─────────── Dibujar rectángulos y textos ─────────── */

  etiquetas
    .append("rect")
    .attr(
      "x",
      (d) =>
        -Math.max(...splitText(d.data.name).map((l) => getTextWidth(l))) / 2 -
        10
    )
    .attr(
      "y",
      (d) => -splitText(d.data.name).length * (d.depth === 0 ? 22 : 18) + 13
    )
    .attr(
      "width",
      (d) =>
        Math.max(...splitText(d.data.name).map((l) => getTextWidth(l))) + 20
    )
    .attr(
      "height",
      (d) => splitText(d.data.name).length * (d.depth === 0 ? 24 : 18)
    );

  etiquetas
    .append("text")
    .attr("text-anchor", "middle")
    .attr("font-size", (d) => (d.depth === 0 ? "16px" : "12px"))
    .selectAll("tspan")
    .data((d) => {
      const lines = splitText(d.data.name || d.data.id);
      return lines.map((line, i, arr) => ({
        line,
        a: arr, // ← array completo, lo usaremos para length
        i, // ← índice de la línea
        depth: d.depth,
      }));
    })
    .join("tspan")
    .attr("x", 0)
    .attr("dy", (d) => {
      if (d.depth === 0) return "0.46em"; // ajuste solo para “Rector”

      const lh = 1.1;
      return d.a.length === 1
        ? ".1em"
        : d.i === 0
        ? `-${((d.a.length - 1) / 2) * lh}em`
        : `${lh}em`;
    })
    .text((d) => d.line);

  /* ─────────── Tooltip ─────────── */

  const tooltip = d3.select("#tooltip");

  etiquetas
    .on("mouseenter", (e, d) => {
      tooltip
        .html(
          `<strong>${d.data.name}</strong><br/>
         ID: ${d.data.id}<br/>
         Responsable: ${d.data.responsable || "N/D"}<br/>
         Iniciales: ${d.data.iniciales || "N/D"}`
        )
        .style("left", e.pageX + 15 + "px")
        .style("top", e.pageY + "px")
        .style("opacity", 1);
    })
    .on("mousemove", (e) =>
      tooltip.style("left", e.pageX + 15 + "px").style("top", e.pageY + "px")
    )
    .on("mouseleave", () => tooltip.style("opacity", 0));
});
