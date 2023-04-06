/* eslint-disable no-await-in-loop */
/* global actions, api */

const NB_SCHEDULE_WITNESSES_VOTE_MIN_APPROVAL = 11;

actions.createSSC = async () => {
  const tableExists = await api.db.tableExists('witnessesactions');

  if (tableExists === false) {
    await api.db.createTable('scheduleWitnessesVotes', ['round', 'approval']);
    await api.db.createTable('params');
    const params = {
      scheduleWitnessesVotesMinApproval: NB_SCHEDULE_WITNESSES_VOTE_MIN_APPROVAL,
    };
    await api.db.insert('params', params);
  }
};

const getTopActiveWitnesses = async () => {
  const witnessParams = await api.db.findOneInTable('witnesses', 'params', { });
  const { lastVerifiedBlockNumber } = witnessParams;
  const currentBlock = lastVerifiedBlockNumber + 1;
  const scheduledWitnesses = await api.db.findOneInTable('witnesses', 'schedules', { blockNumber: currentBlock });
  return scheduledWitnesses;
};

actions.voteScheduleWitnesses = async (payload) => {
  const { approval } = payload;
  if (!api.assert(typeof approval === 'boolean', 'approval should be true or false')) {
    return;
  }
  const topWitnesses = await getTopActiveWitnesses();
  if (api.assert(topWitnesses.includes(api.sender), 'not top witness')) {
    const witnessParams = await api.db.findOneInTable('witnesses', 'params', { });
    const currentRound = witnessParams.round + 1;
    await api.db.insert('scheduleWitnessesVotes', { witness: api.sender, approval, round: currentRound });
    const approvals = await api.db.find('scheduleWitnessesVotes', { round: currentRound, approval: true });
    const params = await api.db.findOne('params', { });
    if (approvals.length >= params.scheduleWitnessesVotesMinApproval) {
      await api.executeSmartContract('witnesses', 'scheduleWitnesses', { });
      approvals.forEach(async (singleApproval) => {
        await api.db.remove('scheduleWitnessesVotes', singleApproval);
      });
      api.emit('scheduleWitnessesTriggeredByWitnessesVotes', {});
    }
  }
};
