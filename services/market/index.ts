import { cache } from "react";
import { toResult } from "../types";
import { fetchTopCrypto } from "./coingecko";
/** Uma única consulta por renderização, mesmo usada em vários blocos. */
export const getTopCrypto = cache(() => toResult(() => fetchTopCrypto(10)));
