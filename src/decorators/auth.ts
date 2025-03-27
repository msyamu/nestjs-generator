import { createParamDecorator, SetMetadata } from "@nestjs/common";

export function Auth(enabled = true) {
  return SetMetadata("AUTH_ENABLED", enabled);
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Auth {
  export const UserId: () => ParameterDecorator = createParamDecorator(
    () => {
      return 1;
    }
  );
}
