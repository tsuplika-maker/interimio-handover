import { createContext, useContext } from "react";

export const AuthContext = createContext({ user: null, openLogin: () => {}, ensureAuth: () => false, ensureManagerAuth: () => false });

export const useAuthCtx = () => useContext(AuthContext);
