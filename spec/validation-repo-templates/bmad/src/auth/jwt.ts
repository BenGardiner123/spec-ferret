// @ferret-contract: auth.jwt-payload api
export interface JwtPayload {
  id: string;
  email: string;
  token: string;
  expiresAt: string;
}
