export interface City {
  name: string;
  lat: number;
  lng: number;
}

export interface Province {
  id: string;
  name: string;
  cities: City[];
}

export const PROVINCES: Province[] = [
  {
    id: "caba",
    name: "Ciudad de Buenos Aires",
    cities: [
      { name: "Centro", lat: -34.6037, lng: -58.3816 },
      { name: "Palermo", lat: -34.5795, lng: -58.4222 },
      { name: "La Boca", lat: -34.6345, lng: -58.3631 },
    ],
  },
  {
    id: "buenos-aires",
    name: "Buenos Aires",
    cities: [
      { name: "La Plata", lat: -34.9215, lng: -57.9545 },
      { name: "Mar del Plata", lat: -38.0055, lng: -57.5426 },
      { name: "Bahia Blanca", lat: -38.7196, lng: -62.2724 },
      { name: "Tandil", lat: -37.3217, lng: -59.1332 },
    ],
  },
  {
    id: "catamarca",
    name: "Catamarca",
    cities: [
      { name: "San Fernando del Valle", lat: -28.4696, lng: -65.7852 },
      { name: "Belen", lat: -27.6497, lng: -67.0328 },
      { name: "Andalgala", lat: -27.6, lng: -66.3167 },
    ],
  },
  {
    id: "chaco",
    name: "Chaco",
    cities: [
      { name: "Resistencia", lat: -27.4513, lng: -58.9868 },
      { name: "Presidencia Roque Saenz Pena", lat: -26.785, lng: -60.4397 },
      { name: "Villa Angela", lat: -27.5736, lng: -60.7147 },
    ],
  },
  {
    id: "chubut",
    name: "Chubut",
    cities: [
      { name: "Rawson", lat: -43.3002, lng: -65.1023 },
      { name: "Comodoro Rivadavia", lat: -45.8647, lng: -67.4822 },
      { name: "Trelew", lat: -43.2489, lng: -65.3095 },
      { name: "Esquel", lat: -42.9117, lng: -71.3167 },
    ],
  },
  {
    id: "cordoba",
    name: "Cordoba",
    cities: [
      { name: "Cordoba", lat: -31.4201, lng: -64.1888 },
      { name: "Villa Maria", lat: -32.4073, lng: -63.2428 },
      { name: "Rio Cuarto", lat: -33.1307, lng: -64.3499 },
      { name: "Carlos Paz", lat: -31.4241, lng: -64.4978 },
    ],
  },
  {
    id: "corrientes",
    name: "Corrientes",
    cities: [
      { name: "Corrientes", lat: -27.4692, lng: -58.8306 },
      { name: "Goya", lat: -29.14, lng: -59.2634 },
      { name: "Mercedes", lat: -29.1839, lng: -58.0736 },
    ],
  },
  {
    id: "entre-rios",
    name: "Entre Rios",
    cities: [
      { name: "Parana", lat: -31.7413, lng: -60.5115 },
      { name: "Concordia", lat: -31.3929, lng: -58.0207 },
      { name: "Gualeguaychu", lat: -33.0094, lng: -58.5172 },
    ],
  },
  {
    id: "formosa",
    name: "Formosa",
    cities: [
      { name: "Formosa", lat: -26.1775, lng: -58.1781 },
      { name: "Clorinda", lat: -25.2839, lng: -57.7189 },
      { name: "Pirané", lat: -25.7325, lng: -59.1089 },
    ],
  },
  {
    id: "jujuy",
    name: "Jujuy",
    cities: [
      { name: "San Salvador de Jujuy", lat: -24.1858, lng: -65.2995 },
      { name: "San Pedro", lat: -24.2314, lng: -64.8689 },
      { name: "Palpala", lat: -24.2564, lng: -65.2106 },
    ],
  },
  {
    id: "la-pampa",
    name: "La Pampa",
    cities: [
      { name: "Santa Rosa", lat: -36.6167, lng: -64.2833 },
      { name: "General Pico", lat: -35.6566, lng: -63.7568 },
      { name: "Toay", lat: -36.6722, lng: -64.3808 },
    ],
  },
  {
    id: "la-rioja",
    name: "La Rioja",
    cities: [
      { name: "La Rioja", lat: -29.4131, lng: -66.8559 },
      { name: "Chilecito", lat: -29.1631, lng: -67.4928 },
      { name: "Chamical", lat: -30.3583, lng: -66.3133 },
    ],
  },
  {
    id: "mendoza",
    name: "Mendoza",
    cities: [
      { name: "Mendoza", lat: -32.8895, lng: -68.8458 },
      { name: "San Rafael", lat: -34.6177, lng: -68.3301 },
      { name: "Godoy Cruz", lat: -32.9304, lng: -68.8389 },
      { name: "Malargue", lat: -35.4736, lng: -69.5842 },
    ],
  },
  {
    id: "misiones",
    name: "Misiones",
    cities: [
      { name: "Posadas", lat: -27.3621, lng: -55.8969 },
      { name: "Obera", lat: -27.4878, lng: -55.0992 },
      { name: "Eldorado", lat: -26.4044, lng: -54.6319 },
    ],
  },
  {
    id: "neuquen",
    name: "Neuquen",
    cities: [
      { name: "Neuquen", lat: -38.9516, lng: -68.0591 },
      { name: "San Martin de los Andes", lat: -40.1575, lng: -71.3524 },
      { name: "Zapala", lat: -38.8994, lng: -70.0544 },
    ],
  },
  {
    id: "rio-negro",
    name: "Rio Negro",
    cities: [
      { name: "Viedma", lat: -40.8135, lng: -62.9967 },
      { name: "San Carlos de Bariloche", lat: -41.1335, lng: -71.3103 },
      { name: "General Roca", lat: -39.0307, lng: -67.0846 },
      { name: "Cipolletti", lat: -38.9353, lng: -67.9925 },
    ],
  },
  {
    id: "salta",
    name: "Salta",
    cities: [
      { name: "Salta", lat: -24.7829, lng: -65.4232 },
      { name: "San Ramon de la Nueva Oran", lat: -23.1383, lng: -64.3261 },
      { name: "Tartagal", lat: -22.5167, lng: -63.8014 },
    ],
  },
  {
    id: "san-juan",
    name: "San Juan",
    cities: [
      { name: "San Juan", lat: -31.5375, lng: -68.5364 },
      { name: "Rawson", lat: -31.5283, lng: -68.4906 },
      { name: "Caucete", lat: -31.6519, lng: -68.2811 },
    ],
  },
  {
    id: "san-luis",
    name: "San Luis",
    cities: [
      { name: "San Luis", lat: -33.3017, lng: -66.3378 },
      { name: "Villa Mercedes", lat: -33.6757, lng: -65.4616 },
      { name: "Merlo", lat: -32.3447, lng: -65.0153 },
    ],
  },
  {
    id: "santa-cruz",
    name: "Santa Cruz",
    cities: [
      { name: "Rio Gallegos", lat: -51.6226, lng: -69.2181 },
      { name: "Caleta Olivia", lat: -46.4393, lng: -67.5214 },
      { name: "El Calafate", lat: -50.3388, lng: -72.2647 },
    ],
  },
  {
    id: "santa-fe",
    name: "Santa Fe",
    cities: [
      { name: "Rosario", lat: -32.9468, lng: -60.6393 },
      { name: "Santa Fe", lat: -31.6333, lng: -60.7 },
      { name: "Rafaela", lat: -31.2517, lng: -61.4867 },
      { name: "Venado Tuerto", lat: -33.7456, lng: -61.9689 },
    ],
  },
  {
    id: "santiago-del-estero",
    name: "Santiago del Estero",
    cities: [
      { name: "Santiago del Estero", lat: -27.7951, lng: -64.2615 },
      { name: "La Banda", lat: -27.7333, lng: -64.2433 },
      { name: "Teherma de Rio Hondo", lat: -27.4942, lng: -64.8597 },
    ],
  },
  {
    id: "tierra-del-fuego",
    name: "Tierra del Fuego",
    cities: [
      { name: "Ushuaia", lat: -54.8019, lng: -68.3029 },
      { name: "Rio Grande", lat: -53.7878, lng: -67.7091 },
      { name: "Tolhuin", lat: -54.5136, lng: -67.1942 },
    ],
  },
  {
    id: "tucuman",
    name: "Tucuman",
    cities: [
      { name: "San Miguel de Tucuman", lat: -26.8083, lng: -65.2176 },
      { name: "Tafi Viejo", lat: -26.7333, lng: -65.2572 },
      { name: "Concepcion", lat: -27.3333, lng: -65.5833 },
    ],
  },
];
