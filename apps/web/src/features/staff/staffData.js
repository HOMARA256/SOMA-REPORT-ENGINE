export const staffMembers = [];
export function findStaffMember(id) {
    return staffMembers.find((member) => member.id === id);
}
