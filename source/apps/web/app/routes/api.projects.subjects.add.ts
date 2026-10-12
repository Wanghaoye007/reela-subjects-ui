import { addSubjects } from '~/modules/project/add-subject.server';
import { addSubjectSchema as schema } from '~/modules/project/project-contract';
import { apiResponse, readMultipartOrJson, methodNotAllowed } from '~/lib/api/api-response.server';
import { getRequestContext } from '~/middleware/request-context.server';
import type { Route } from './+types/api.projects.subjects.add';
export function action(args: Route.ActionArgs) {
  return apiResponse(
    args,
    async () => {
      const input = schema.parse(await readMultipartOrJson(args.request, ['referenceImages']));
      const { userId } = getRequestContext(args.context);
      return addSubjects(input, userId!);
    },
    { status: 201 },
  );
}
export function loader() {
  return methodNotAllowed();
}
