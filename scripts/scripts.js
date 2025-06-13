const width = 800;
const radius = width / 2;
const AMPLITUDE = 0.6;
const EXPONENT = 3;
const levelRadii = [1, 120, 300, 420];

function getTextWidth(text, fontSize = 12) {
  const context = document.createElement("canvas").getContext("2d");
  context.font = `${fontSize}px sans-serif`;
  return context.measureText(text).width;
}

function splitText(text, maxLength = 16) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + word).length <= maxLength) {
      current += (current ? " " : "") + word;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const svg = d3
  .select("svg")
  .attr("viewBox", [-width / 2, -width / 2, width, width]);

async function loadHierarchyFromCSV(url) {
  const data = await d3.csv(url);
  const map = new Map();
  data.forEach((d) => map.set(d.id, { ...d, children: [] }));
  let root = null;
  data.forEach((d) => {
    const node = map.get(d.id);
    if (d.parent) {
      map.get(d.parent).children.push(node);
    } else {
      root = node;
    }
  });
  return d3.hierarchy(root);
}

const angleWeight = (t) =>
  1 + AMPLITUDE * Math.pow(Math.abs(Math.cos(t * 2 * Math.PI)), EXPONENT);

loadHierarchyFromCSV(
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTNXhGTkH8VkrFUx8kfwH37I2FfRKk7iwbHsDpfhNGBZj7EvNCNuzBA6ihlVfkmVR7JhM_NtzkEq4nt/pub?gid=1139573771&single=true&output=csv"
).then((root) => {
  const levels = [];
  root.each((d) => {
    if (!levels[d.depth]) levels[d.depth] = [];
    levels[d.depth].push(d);
  });

  if (levels[0]?.length === 1) {
    const rector = levels[0][0];
    rector.x = Math.PI / 2;
    rector.y = levelRadii[0];
  }

  levels.forEach((nodes, depth) => {
    if (depth === 0) return;

    if (depth === 3) {
      const OFFSET = 0.165;
      const delegadosPorAdjunto = d3.group(nodes, (d) => d.parent);
      delegadosPorAdjunto.forEach((grupo, padre) => {
        const n = grupo.length;
        grupo.forEach((d, i) => {
          const desplazamiento = (i - (n - 1) / 2) * OFFSET;
          d.x = padre.x + desplazamiento;
          d.y = levelRadii[depth] || 480;
        });
      });
    } else {
      const weights = nodes.map((_, i) => angleWeight(i / (nodes.length - 1)));
      const total = d3.sum(weights);
      const scale = d3
        .scaleLinear()
        .domain([0, total])
        .range([0, 2 * Math.PI]);

      let acc = 0;
      nodes.forEach((d, i) => {
        const w = weights[i];
        d.x = scale(acc + w / 2);
        d.y = levelRadii[depth] || 480;
        acc += w;
      });
    }
  });

  svg
    .append("g")
    .attr("class", "link")
    .selectAll("path")
    .data(root.links())
    .join("path")
    .attr("class", "enlace")
    .each((d, i, nodes) => {
      d.el = nodes[i]; // Guarda referencia al DOM
    })
    .attr(
      "d",
      d3
        .linkRadial()
        .angle((d) => d.x)
        .radius((d) => d.y)
    );

  const nodes = svg
    .append("g")
    .selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("class", (d) => `node depth-${d.depth}`)
    .attr("transform", (d) => {
      const angle = d.x - Math.PI / 2;
      const x = Math.cos(angle) * d.y;
      const y = Math.sin(angle) * d.y;
      return `translate(${x},${y})`;
    });

  const etiquetas = nodes
    .append("g")
    .attr("class", "etiqueta")
    .each(function (d) {
      d.el = this;
    });

  etiquetas.on("click", function (event, d) {
    const todosNodos = svg.selectAll(".etiqueta");
    const todosEnlaces = svg.selectAll(".enlace");

    // Quita resaltado anterior
    todosNodos.classed("apagado", true).classed("resaltado", false);
    todosEnlaces.classed("apagado", true).classed("resaltado", false);

    // Marca los nodos ascendentes como resaltados
    let actual = d;
    const nodosResaltados = new Set();
    while (actual) {
      d3.select(actual.el).classed("resaltado", true).classed("apagado", false);
      nodosResaltados.add(actual);
      actual = actual.parent;
    }

    // Marca solo los enlaces conectando nodos resaltados
    root.links().forEach((link) => {
      if (
        nodosResaltados.has(link.source) &&
        nodosResaltados.has(link.target)
      ) {
        d3.select(link.el).classed("resaltado", true).classed("apagado", false);
      }
    });
  });

  // Al hacer clic fuera, restaurar todo
  svg.on("click", function (event) {
    const isEtiqueta = event.target.closest(".etiqueta");
    if (!isEtiqueta) {
      svg
        .selectAll(".etiqueta")
        .classed("apagado", false)
        .classed("resaltado", false);
      svg
        .selectAll(".link path")
        .classed("apagado", false)
        .classed("resaltado", false);
    }
  });

  etiquetas
    .append("rect")
    .attr("x", (d) => {
      const lines = splitText(d.data.name || d.data.id);
      const size = d.depth === 0 ? 16 : 12;
      const widest = Math.max(...lines.map((l) => getTextWidth(l, size)));
      return -widest / 2 - 10;
    })
    .attr("y", (d) => {
      const lines = splitText(d.data.name || d.data.id).length;
      const height = d.depth === 0 ? 22 : 18;
      return -height * lines + 6;
    })
    .attr("width", (d) => {
      const lines = splitText(d.data.name || d.data.id);
      const size = d.depth === 0 ? 16 : 12;
      const widest = Math.max(...lines.map((l) => getTextWidth(l, size)));
      return widest + 20;
    })
    .attr("height", (d) => {
      const lines = splitText(d.data.name || d.data.id).length;
      const height = d.depth === 0 ? 24 : 18;
      return height * lines;
    });

  etiquetas
    .append("text")
    .attr("text-anchor", "middle")
    .attr("font-size", (d) => (d.depth === 0 ? "16px" : "12px"))
    .selectAll("tspan")
    .data((d) => {
      const lines = splitText(d.data.name || d.data.id);
      return lines.map((line, i, arr) => ({
        line,
        total: arr.length,
        index: i,
        depth: d.depth,
      }));
    })
    .join("tspan")
    .attr("x", 0)
    .attr("dy", (d) => {
      const lineHeight = d.depth === 0 ? 1.3 : 1.1;
      if (d.total === 1) return d.depth === 0 ? "0.1em" : "0.1em";
      if (d.total === 2) return d.index === 0 ? "-1.15em" : `${lineHeight}em`;
      if (d.total === 3) return d.index === 0 ? "-2.4em" : `${lineHeight}em`;
      const shift = ((d.total - 1) / 2) * lineHeight;
      return d.index === 0 ? `${-shift + 0.35}em` : `${lineHeight}em`;
    })
    .text((d) => d.line);

  const tooltip = d3.select("#tooltip");

  etiquetas
    .on("mouseenter", function (event, d) {
      tooltip
        .html(
          `
        <strong>${d.data.name}</strong><br/>
        ID: ${d.data.id}<br/>
        Responsable: ${d.data.responsable || "N/D"}<br/>
        Iniciales: ${d.data.iniciales || "N/D"}
      `
        )
        .style("left", event.pageX + 15 + "px")
        .style("top", event.pageY + "px")
        .style("opacity", 1);
    })
    .on("mousemove", function (event) {
      tooltip
        .style("left", event.pageX + 15 + "px")
        .style("top", event.pageY + "px");
    })
    .on("mouseleave", function () {
      tooltip.style("opacity", 0);
    });
});
