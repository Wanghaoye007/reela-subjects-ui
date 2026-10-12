import { getRequestContext } from '~/middleware/request-context.server';
import { regenSubject } from '~/modules/project/regen-subject.server';
import { regenSubjectSchema as schema } from '~/modules/project/project-contract';
import { apiResponse, readMultipartOrJson, methodNotAllowed } from '~/lib/api/api-response.server';
import type { Route } from './+types/api.projects.subjects.regenerate';
export function action(args: Route.ActionArgs) {
  return apiResponse(
    args,
    async () => {
      const input = schema.parse(await readMultipartOrJson(args.request, ['referenceImages']));

      return regenSubject(input, getRequestContext(args.context).userId!);
    },
    { status: 202 },
  );
}
export function loader() {
  return methodNotAllowed();
}
